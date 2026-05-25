import csv
import io
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.db import transaction
from django.utils import timezone

from .models import AuditLog, DataSource, EmissionRecord, RawRecord, Tenant, ValidationIssue


FUEL_SCOPE_1 = {"diesel", "petrol", "gasoline", "natural gas"}
TRAVEL_SCOPE_3 = {"flight", "flights", "hotel", "hotels", "ground", "ground transport", "rail", "taxi", "train", "cab"}


@dataclass
class NormalizedRecord:
    scope: str
    category: str
    activity_type: str
    quantity: Decimal | None
    unit: str
    data: dict


def decimal_or_none(value):
    if value is None or str(value).strip() == "":
        return None
    try:
        return Decimal(str(value).replace(",", "").strip())
    except InvalidOperation:
        return None


def parse_date(value):
    if not value:
        return None
    raw = str(value).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return raw


def clean_keyed_row(row):
    return {str(key).strip(): (value.strip() if isinstance(value, str) else value) for key, value in row.items()}


def get_tenant(slug):
    name = slug.replace("-", " ").title()
    return Tenant.objects.get_or_create(slug=slug, defaults={"name": name})[0]


def get_data_source(tenant, source_type):
    labels = {
        DataSource.SourceType.SAP: "SAP Fuel & Procurement Upload",
        DataSource.SourceType.UTILITY: "Utility Electricity Upload",
        DataSource.SourceType.TRAVEL: "Corporate Travel Upload",
    }
    return DataSource.objects.get_or_create(
        tenant=tenant,
        source_type=source_type,
        name=labels[source_type],
    )[0]


def normalize_quantity(quantity, unit):
    if quantity is None:
        return None, ""
    normalized_unit = (unit or "").strip().lower()
    if normalized_unit in {"mwh"}:
        return quantity * Decimal("1000"), "kWh"
    if normalized_unit in {"kwh"}:
        return quantity, "kWh"
    if normalized_unit in {"l", "liter", "litre", "liters", "litres"}:
        return quantity, "L"
    if normalized_unit in {"kl", "kiloliter", "kilolitre", "kiloliters", "kilolitres"}:
        return quantity * Decimal("1000"), "L"
    if normalized_unit in {"m3", "cubic meter", "cubic metre"}:
        return quantity, "m3"
    if normalized_unit in {"km", "kilometer", "kilometre", "kilometers", "kilometres"}:
        return quantity, "km"
    if normalized_unit in {"mi", "mile", "miles"}:
        return quantity * Decimal("1.60934"), "km"
    return quantity, unit or ""


def normalize_sap(row):
    quantity = decimal_or_none(row.get("Quantity"))
    normalized_quantity, normalized_unit = normalize_quantity(quantity, row.get("Unit"))
    fuel_type = (row.get("Fuel Type") or row.get("Material Description") or "").strip()
    fuel_lower = fuel_type.lower()
    scope = EmissionRecord.Scope.SCOPE_1 if any(token in fuel_lower for token in FUEL_SCOPE_1) else EmissionRecord.Scope.SCOPE_3
    category = "Fuel Combustion" if scope == EmissionRecord.Scope.SCOPE_1 else "Procurement"
    return NormalizedRecord(
        scope=scope,
        category=category,
        activity_type=fuel_type or "Procurement",
        quantity=normalized_quantity,
        unit=normalized_unit,
        data={
            "plant_code": row.get("Plant Code"),
            "material_description": row.get("Material Description"),
            "fuel_type": fuel_type,
            "posting_date": parse_date(row.get("Posting Date")),
            "source_quantity": str(quantity) if quantity is not None else None,
            "source_unit": row.get("Unit"),
        },
    )


def normalize_utility(row):
    consumption = decimal_or_none(row.get("Consumption"))
    normalized_quantity, normalized_unit = normalize_quantity(consumption, row.get("Unit"))
    return NormalizedRecord(
        scope=EmissionRecord.Scope.SCOPE_2,
        category="Purchased Electricity",
        activity_type="Electricity",
        quantity=normalized_quantity,
        unit=normalized_unit,
        data={
            "meter_id": row.get("Meter ID"),
            "billing_start_date": parse_date(row.get("Billing Start Date")),
            "billing_end_date": parse_date(row.get("Billing End Date")),
            "source_consumption": str(consumption) if consumption is not None else None,
            "source_unit": row.get("Unit"),
        },
    )


def normalize_travel(row):
    distance = decimal_or_none(row.get("Distance"))
    normalized_distance, normalized_unit = normalize_quantity(distance, row.get("Unit") or "km")
    trip_type = (row.get("Trip Type") or "").strip()
    trip_lower = trip_type.lower()
    if "hotel" in trip_lower:
        category = "Hotels"
        quantity = decimal_or_none(row.get("Hotel Nights"))
        unit = "night"
    elif "ground" in trip_lower or trip_lower in TRAVEL_SCOPE_3:
        category = "Ground Transport"
        quantity = normalized_distance
        unit = normalized_unit or "km"
    else:
        category = "Flights"
        quantity = normalized_distance
        unit = normalized_unit or "km"
    return NormalizedRecord(
        scope=EmissionRecord.Scope.SCOPE_3,
        category=category,
        activity_type=trip_type or category,
        quantity=quantity,
        unit=unit,
        data={
            "trip_type": trip_type,
            "origin": row.get("Origin"),
            "destination": row.get("Destination"),
            "distance_km": str(normalized_distance) if normalized_distance is not None else None,
            "travel_class": row.get("Travel Class"),
            "hotel_nights": row.get("Hotel Nights"),
        },
    )


def validate_sap(row, normalized):
    issues = []
    if normalized.quantity is not None and normalized.quantity < 0:
        issues.append(("fuel_negative_quantity", "Fuel quantity cannot be negative.", "error", "Quantity"))
    if not row.get("Plant Code"):
        issues.append(("fuel_missing_plant_code", "Plant code is required for SAP fuel/procurement records.", "warning", "Plant Code"))
    return issues


def validate_utility(row, normalized):
    issues = []
    if normalized.quantity is not None and normalized.quantity > Decimal("500000"):
        issues.append(("electricity_unusually_high", "Electricity consumption is unusually high after kWh normalization.", "warning", "Consumption"))
    if not row.get("Billing Start Date") or not row.get("Billing End Date"):
        issues.append(("electricity_missing_billing_period", "Billing start and end dates are required.", "error", "Billing Period"))
    return issues


def validate_travel(row, normalized):
    issues = []
    category = normalized.category
    if category in {"Flights", "Ground Transport"} and (not row.get("Origin") or not row.get("Destination")):
        issues.append(("travel_missing_route", "Origin and destination are required for transport records.", "warning", "Origin/Destination"))
    if category in {"Flights", "Ground Transport"} and (normalized.quantity is None or normalized.quantity == 0):
        issues.append(("travel_zero_distance", "Distance must be greater than zero for transport records.", "warning", "Distance"))
    return issues


NORMALIZERS = {
    DataSource.SourceType.SAP: normalize_sap,
    DataSource.SourceType.UTILITY: normalize_utility,
    DataSource.SourceType.TRAVEL: normalize_travel,
}

VALIDATORS = {
    DataSource.SourceType.SAP: validate_sap,
    DataSource.SourceType.UTILITY: validate_utility,
    DataSource.SourceType.TRAVEL: validate_travel,
}

SOURCE_HEADERS = {
    DataSource.SourceType.SAP: ["Plant Code", "Material Description", "Fuel Type", "Quantity", "Unit", "Posting Date"],
    DataSource.SourceType.UTILITY: ["Meter ID", "Billing Start Date", "Billing End Date", "Consumption", "Unit"],
    DataSource.SourceType.TRAVEL: ["Trip Type", "Origin", "Destination", "Distance", "Unit", "Travel Class", "Hotel Nights"],
}

HEADER_ALIASES = {
    "Billing Start Date": ["Billing Start Date", "Start Date"],
    "Billing End Date": ["Billing End Date", "End Date"],
}


def read_csv_rows(file_obj):
    text = file_obj.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def split_pdf_table_line(line):
    if "\t" in line:
        return [part.strip() for part in line.split("\t")]
    if "|" in line:
        return [part.strip() for part in line.split("|")]
    return [part.strip() for part in re.split(r"\s{2,}", line.strip())]


def normalized_text(value):
    return re.sub(r"\s+", " ", value).strip().lower()


def looks_like_header(line, headers):
    normalized_line = normalized_text(line)
    return all(any(normalized_text(alias) in normalized_line for alias in HEADER_ALIASES.get(header, [header])) for header in headers)


def parse_utility_pdf_line(line):
    match = re.match(
        r"^(?P<meter>\S+)\s+"
        r"(?P<start>\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4}|\d{1,2}-\d{1,2}-\d{4})\s+"
        r"(?P<end>\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4}|\d{1,2}-\d{1,2}-\d{4})\s+"
        r"(?P<consumption>-?[\d,.]+)\s+"
        r"(?P<unit>\S+)$",
        line.strip(),
    )
    if not match:
        return None
    return {
        "Meter ID": match.group("meter"),
        "Billing Start Date": match.group("start"),
        "Billing End Date": match.group("end"),
        "Consumption": match.group("consumption"),
        "Unit": match.group("unit"),
    }


def parse_sap_pdf_line(line):
    match = re.match(
        r"^(?P<left>.+?)\s+"
        r"(?P<quantity>-?[\d,.]+)\s+"
        r"(?P<unit>\S+)\s+"
        r"(?P<date>\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4}|\d{1,2}-\d{1,2}-\d{4})$",
        line.strip(),
    )
    if not match:
        return None

    left = match.group("left")
    fuel_match = re.search(r"\s(Diesel|Natural Gas|Petrol|Gasoline|Procurement)\s*$", left, re.IGNORECASE)
    if not fuel_match:
        return None

    fuel_type = fuel_match.group(1)
    before_fuel = left[: fuel_match.start()].strip()
    parts = before_fuel.split(maxsplit=1)
    plant_code = parts[0] if parts and re.search(r"\d", parts[0]) else ""
    material = parts[1] if plant_code and len(parts) > 1 else before_fuel
    return {
        "Plant Code": plant_code,
        "Material Description": material,
        "Fuel Type": fuel_type,
        "Quantity": match.group("quantity"),
        "Unit": match.group("unit"),
        "Posting Date": match.group("date"),
    }


def parse_travel_pdf_line(line):
    match = re.match(
        r"^(?P<trip>Ground Transport|Flight|Hotel)\s+"
        r"(?P<origin>\S*)\s+"
        r"(?P<destination>\S*)\s+"
        r"(?P<distance>-?[\d,.]+)\s+"
        r"(?P<unit>\S+)\s+"
        r"(?P<class>.+?)\s+"
        r"(?P<nights>-?[\d,.]+)$",
        line.strip(),
        re.IGNORECASE,
    )
    if not match:
        return None
    return {
        "Trip Type": match.group("trip"),
        "Origin": match.group("origin"),
        "Destination": match.group("destination"),
        "Distance": match.group("distance"),
        "Unit": match.group("unit"),
        "Travel Class": match.group("class"),
        "Hotel Nights": match.group("nights"),
    }


SOURCE_LINE_PARSERS = {
    DataSource.SourceType.SAP: parse_sap_pdf_line,
    DataSource.SourceType.UTILITY: parse_utility_pdf_line,
    DataSource.SourceType.TRAVEL: parse_travel_pdf_line,
}


def rows_from_known_pdf_text(text, source_type):
    headers = SOURCE_HEADERS[source_type]
    parser = SOURCE_LINE_PARSERS[source_type]
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    report_rows = rows_from_report_pdf_lines(lines, source_type)
    if report_rows:
        return report_rows

    stacked_rows = rows_from_stacked_pdf_lines(lines, headers)
    if stacked_rows:
        return stacked_rows

    rows = []
    started = False
    for line in lines:
        if looks_like_header(line, headers):
            started = True
            continue
        if not started and any(normalized_text(header) in normalized_text(line) for header in headers):
            continue
        row = parser(line)
        if row:
            rows.append(row)
    return rows


def rows_from_report_pdf_lines(lines, source_type):
    if source_type == DataSource.SourceType.SAP:
        rows = rows_from_stacked_pdf_lines(
            lines,
            ["Record ID", "Start Date", "End Date", "Source", "Category", "Quantity", "Unit", "Rate"],
        )
        return [
            {
                "Plant Code": row.get("Record ID", ""),
                "Material Description": f"{row.get('Source', '')} {row.get('Category', '')}".strip(),
                "Fuel Type": row.get("Category", ""),
                "Quantity": row.get("Quantity", ""),
                "Unit": row.get("Unit", ""),
                "Posting Date": row.get("End Date", "") or row.get("Start Date", ""),
            }
            for row in rows
        ]

    if source_type == DataSource.SourceType.TRAVEL:
        rows = rows_from_stacked_pdf_lines(
            lines,
            ["Trip ID", "Start Date", "End Date", "Mode", "Route", "Distance", "Rate"],
        )
        mapped_rows = []
        for row in rows:
            origin, destination = split_route(row.get("Route", ""))
            distance, unit = split_quantity_unit(row.get("Distance", ""))
            mapped_rows.append(
                {
                    "Trip Type": row.get("Mode", ""),
                    "Origin": origin,
                    "Destination": destination,
                    "Distance": distance,
                    "Unit": unit or "km",
                    "Travel Class": "Standard",
                    "Hotel Nights": "0",
                }
            )
        return mapped_rows

    return []


def split_route(route):
    if "-" not in route:
        return route, ""
    origin, destination = route.split("-", 1)
    return origin.strip(), destination.strip()


def split_quantity_unit(value):
    match = re.match(r"^\s*(?P<quantity>-?[\d,.]+)\s*(?P<unit>\S+)?\s*$", value or "")
    if not match:
        return value or "", ""
    return match.group("quantity"), match.group("unit") or ""


def rows_from_stacked_pdf_lines(lines, headers):
    normalized_headers = [
        {normalized_text(alias) for alias in HEADER_ALIASES.get(header, [header])}
        for header in headers
    ]
    for index in range(0, len(lines) - len(headers) + 1):
        window = [normalized_text(line) for line in lines[index : index + len(headers)]]
        if not all(value in allowed for value, allowed in zip(window, normalized_headers)):
            continue

        values = lines[index + len(headers) :]
        row_width = len(headers)
        if len(values) < row_width:
            return []

        rows = []
        for value_index in range(0, len(values), row_width):
            row_values = values[value_index : value_index + row_width]
            if len(row_values) != row_width:
                break
            rows.append(dict(zip(headers, row_values)))
        return rows
    return []


def rows_from_pdf_text(text, source_type=None):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return []

    header_index = None
    headers = []
    for index, line in enumerate(lines):
        parts = split_pdf_table_line(line)
        if len(parts) > 1:
            header_index = index
            headers = parts
            break

    if header_index is None:
        if source_type in SOURCE_HEADERS:
            rows = rows_from_known_pdf_text(text, source_type)
            if rows:
                return rows
        raise ValueError("Could not find a table in the PDF. Please upload a PDF with selectable table text.")

    rows = []
    for line in lines[header_index + 1 :]:
        values = split_pdf_table_line(line)
        if len(values) != len(headers):
            continue
        rows.append(dict(zip(headers, values)))
    if not rows and source_type in SOURCE_HEADERS:
        rows = rows_from_known_pdf_text(text, source_type)
    return rows


def read_pdf_rows(file_obj, source_type):
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ValueError("PDF uploads require the pypdf package to be installed.") from exc

    try:
        reader = PdfReader(file_obj)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        raise ValueError("Could not read the PDF. Upload a valid, unencrypted PDF with selectable table text.") from exc
    return rows_from_pdf_text(text, source_type=source_type)


def rows_from_upload(file_obj, source_type):
    filename = Path(getattr(file_obj, "name", "")).name.lower()
    content_type = (getattr(file_obj, "content_type", "") or "").lower()
    if filename.endswith(".pdf") or content_type == "application/pdf":
        return read_pdf_rows(file_obj, source_type)
    if filename.endswith(".csv") or content_type in {"text/csv", "application/vnd.ms-excel", ""}:
        return read_csv_rows(file_obj)
    raise ValueError("Unsupported file type. Upload a CSV or a PDF with selectable table text.")


@transaction.atomic
def ingest_upload(file_obj, source_type, tenant_slug="demo"):
    tenant = get_tenant(tenant_slug)
    data_source = get_data_source(tenant, source_type)
    batch_id = uuid.uuid4()
    rows = rows_from_upload(file_obj, source_type)
    if not rows:
        raise ValueError("No rows could be read from the upload. For PDFs, upload a selectable-text table with supported headers.")
    created = []

    for index, raw_row in enumerate(rows, start=1):
        row = clean_keyed_row(raw_row)
        raw = RawRecord.objects.create(
            tenant=tenant,
            data_source=data_source,
            upload_batch_id=batch_id,
            row_number=index,
            original_row=row,
        )
        normalized = NORMALIZERS[source_type](row)
        emission = EmissionRecord.objects.create(
            tenant=tenant,
            raw_record=raw,
            data_source=data_source,
            scope=normalized.scope,
            category=normalized.category,
            activity_type=normalized.activity_type,
            normalized_quantity=normalized.quantity,
            normalized_unit=normalized.unit,
            normalized_data=normalized.data,
        )
        raw.status = RawRecord.Status.VALIDATED
        raw.save(update_fields=["status"])

        for rule_code, message, severity, field in VALIDATORS[source_type](row, normalized):
            ValidationIssue.objects.create(
                tenant=tenant,
                emission_record=emission,
                rule_code=rule_code,
                message=message,
                severity=severity,
                field=field,
            )
        AuditLog.objects.create(
            tenant=tenant,
            emission_record=emission,
            action=AuditLog.Action.CREATED,
            new_value={"status": emission.status, "batch_id": str(batch_id)},
        )
        created.append(emission)

    return {"batch_id": batch_id, "created_count": len(created), "records": created}


def ingest_csv(file_obj, source_type, tenant_slug="demo"):
    return ingest_upload(file_obj, source_type, tenant_slug)


@transaction.atomic
def transition_record(record, action, user=None, comment=""):
    if record.status == EmissionRecord.Status.LOCKED:
        raise ValueError("Locked records cannot be changed.")
    old = {"status": record.status, "analyst_comment": record.analyst_comment}
    now = timezone.now()
    if action == "approve":
        record.status = EmissionRecord.Status.APPROVED
    elif action == "reject":
        record.status = EmissionRecord.Status.REJECTED
    elif action == "lock":
        record.status = EmissionRecord.Status.LOCKED
        record.locked_at = now
    else:
        raise ValueError("Unsupported transition.")
    record.analyst_comment = comment or record.analyst_comment
    record.reviewed_by = user if getattr(user, "is_authenticated", False) else None
    record.reviewed_at = now
    record.save(update_fields=["status", "analyst_comment", "reviewed_by", "reviewed_at", "locked_at", "updated_at"])
    audit_actions = {
        "approve": AuditLog.Action.APPROVED,
        "reject": AuditLog.Action.REJECTED,
        "lock": AuditLog.Action.LOCKED,
    }
    AuditLog.objects.create(
        tenant=record.tenant,
        emission_record=record,
        user=record.reviewed_by,
        action=audit_actions[action],
        old_value=old,
        new_value={"status": record.status, "analyst_comment": record.analyst_comment},
        comment=comment,
    )
    return record


@transaction.atomic
def update_comment(record, user=None, comment=""):
    if record.status == EmissionRecord.Status.LOCKED:
        raise ValueError("Locked records cannot be changed.")
    old = {"analyst_comment": record.analyst_comment}
    record.analyst_comment = comment
    record.reviewed_by = user if getattr(user, "is_authenticated", False) else record.reviewed_by
    record.save(update_fields=["analyst_comment", "reviewed_by", "updated_at"])
    AuditLog.objects.create(
        tenant=record.tenant,
        emission_record=record,
        user=record.reviewed_by,
        action=AuditLog.Action.EDITED,
        old_value=old,
        new_value={"analyst_comment": record.analyst_comment},
        comment=comment,
    )
    return record

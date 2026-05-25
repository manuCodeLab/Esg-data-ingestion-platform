from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from .models import DataSource, EmissionRecord
from .services import normalize_sap, normalize_travel, normalize_utility, rows_from_pdf_text, validate_sap, validate_travel, validate_utility


class NormalizationTests(SimpleTestCase):
    def test_utility_mwh_normalizes_to_kwh(self):
        normalized = normalize_utility({"Consumption": "12.5", "Unit": "MWh"})

        self.assertEqual(normalized.quantity, Decimal("12500.0"))
        self.assertEqual(normalized.unit, "kWh")
        self.assertEqual(normalized.scope, EmissionRecord.Scope.SCOPE_2)

    def test_sap_diesel_maps_to_scope_one(self):
        normalized = normalize_sap({"Fuel Type": "Diesel", "Quantity": "100", "Unit": "KL", "Plant Code": "P01"})

        self.assertEqual(normalized.quantity, Decimal("100000"))
        self.assertEqual(normalized.unit, "L")
        self.assertEqual(normalized.scope, EmissionRecord.Scope.SCOPE_1)

    def test_travel_miles_normalizes_to_kilometers(self):
        normalized = normalize_travel({"Trip Type": "Flight", "Distance": "100", "Unit": "mi", "Origin": "JFK", "Destination": "SFO"})

        self.assertEqual(normalized.quantity, Decimal("160.93400"))
        self.assertEqual(normalized.unit, "km")
        self.assertEqual(normalized.scope, EmissionRecord.Scope.SCOPE_3)


class ValidationTests(SimpleTestCase):
    def test_fuel_negative_quantity_and_missing_plant_are_flagged(self):
        normalized = normalize_sap({"Fuel Type": "Diesel", "Quantity": "-5", "Unit": "L"})
        codes = {issue[0] for issue in validate_sap({}, normalized)}

        self.assertIn("fuel_negative_quantity", codes)
        self.assertIn("fuel_missing_plant_code", codes)

    def test_utility_missing_period_and_high_consumption_are_flagged(self):
        normalized = normalize_utility({"Consumption": "900", "Unit": "MWh"})
        codes = {issue[0] for issue in validate_utility({}, normalized)}

        self.assertIn("electricity_unusually_high", codes)
        self.assertIn("electricity_missing_billing_period", codes)

    def test_travel_missing_route_and_zero_distance_are_flagged(self):
        normalized = normalize_travel({"Trip Type": "Flight", "Distance": "0", "Unit": "km"})
        codes = {issue[0] for issue in validate_travel({}, normalized)}

        self.assertIn("travel_missing_route", codes)
        self.assertIn("travel_zero_distance", codes)


class PdfParsingTests(SimpleTestCase):
    def test_rows_from_pdf_text_reads_spaced_table(self):
        text = """
        Meter ID  Billing Start Date  Billing End Date  Consumption  Unit
        MTR-1     2026-01-01          2026-01-31        12.5         MWh
        """

        rows = rows_from_pdf_text(text)

        self.assertEqual(rows[0]["Meter ID"], "MTR-1")
        self.assertEqual(rows[0]["Consumption"], "12.5")
        self.assertEqual(rows[0]["Unit"], "MWh")

    def test_rows_from_pdf_text_rejects_plain_text_pdf(self):
        with self.assertRaisesMessage(ValueError, "Could not find a table"):
            rows_from_pdf_text("This PDF has no tabular source data.")

    def test_rows_from_pdf_text_reads_single_spaced_utility_table(self):
        text = """
        Meter ID Billing Start Date Billing End Date Consumption Unit
        MTR-IND-001 2026-01-01 2026-01-31 118000 kWh
        """

        rows = rows_from_pdf_text(text, source_type=DataSource.SourceType.UTILITY)

        self.assertEqual(rows[0]["Meter ID"], "MTR-IND-001")
        self.assertEqual(rows[0]["Consumption"], "118000")

    def test_rows_from_pdf_text_reads_utility_rows_without_header(self):
        rows = rows_from_pdf_text("MTR-IND-001 2026-01-01 2026-01-31 118000 kWh", source_type=DataSource.SourceType.UTILITY)

        self.assertEqual(rows[0]["Meter ID"], "MTR-IND-001")
        self.assertEqual(rows[0]["Unit"], "kWh")

    def test_rows_from_pdf_text_reads_stacked_utility_table(self):
        text = """
        Electricity Consumption Report
        Meter ID
        Start Date
        End Date
        Consumption
        Unit
        MTR-IND-001
        2026-01-01
        2026-01-31
        118000
        kWh
        MTR-IND-002
        2026-02-01
        2026-02-28
        102500
        kWh
        """

        rows = rows_from_pdf_text(text, source_type=DataSource.SourceType.UTILITY)

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["Meter ID"], "MTR-IND-001")
        self.assertEqual(rows[1]["Consumption"], "102500")

    def test_rows_from_pdf_text_reads_single_spaced_sap_table(self):
        text = """
        Plant Code Material Description Fuel Type Quantity Unit Posting Date
        IN-MUM-01 Backup generator diesel Diesel 1250 L 2026-01-31
        """

        rows = rows_from_pdf_text(text, source_type=DataSource.SourceType.SAP)

        self.assertEqual(rows[0]["Plant Code"], "IN-MUM-01")
        self.assertEqual(rows[0]["Fuel Type"], "Diesel")

    def test_rows_from_pdf_text_reads_sap_rows_without_header(self):
        rows = rows_from_pdf_text("IN-MUM-01 Backup generator diesel Diesel 1250 L 2026-01-31", source_type=DataSource.SourceType.SAP)

        self.assertEqual(rows[0]["Plant Code"], "IN-MUM-01")
        self.assertEqual(rows[0]["Quantity"], "1250")

    def test_rows_from_pdf_text_reads_stacked_sap_report(self):
        text = """
        SAP Fuel & Procurement Report
        Record ID
        Start Date
        End Date
        Source
        Category
        Quantity
        Unit
        Rate
        SAP-FUEL-001
        2026-01-01
        2026-01-31
        SAP Fuel
        Diesel
        14500
        L
        2.68 kgCO2e/L
        SAP-PROC-001
        2026-01-01
        2026-01-31
        SAP Procurement
        Steel
        9600
        kg
        1.85 kgCO2e/kg
        """

        rows = rows_from_pdf_text(text, source_type=DataSource.SourceType.SAP)

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["Plant Code"], "SAP-FUEL-001")
        self.assertEqual(rows[0]["Fuel Type"], "Diesel")
        self.assertEqual(rows[1]["Material Description"], "SAP Procurement Steel")

    def test_rows_from_pdf_text_reads_single_spaced_travel_table(self):
        text = """
        Trip Type Origin Destination Distance Unit Travel Class Hotel Nights
        Ground Transport SFO SJC 77 km Standard 0
        """

        rows = rows_from_pdf_text(text, source_type=DataSource.SourceType.TRAVEL)

        self.assertEqual(rows[0]["Trip Type"], "Ground Transport")
        self.assertEqual(rows[0]["Distance"], "77")

    def test_rows_from_pdf_text_reads_travel_rows_without_header(self):
        rows = rows_from_pdf_text("Ground Transport SFO SJC 77 km Standard 0", source_type=DataSource.SourceType.TRAVEL)

        self.assertEqual(rows[0]["Trip Type"], "Ground Transport")
        self.assertEqual(rows[0]["Hotel Nights"], "0")

    def test_rows_from_pdf_text_reads_stacked_travel_report(self):
        text = """
        Corporate Travel Report
        Trip ID
        Start Date
        End Date
        Mode
        Route
        Distance
        Rate
        TRV-IND-001
        2026-01-05
        2026-01-05
        Flight
        BLR-DEL
        1740 km
        0.158 kgCO2e/km
        TRV-IND-003
        2026-02-03
        2026-02-03
        Cab
        Office-Airport
        42 km
        0.171 kgCO2e/km
        """

        rows = rows_from_pdf_text(text, source_type=DataSource.SourceType.TRAVEL)

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["Trip Type"], "Flight")
        self.assertEqual(rows[0]["Origin"], "BLR")
        self.assertEqual(rows[0]["Destination"], "DEL")
        self.assertEqual(rows[1]["Distance"], "42")


class UploadTests(TestCase):
    def test_upload_rejects_unreadable_pdf(self):
        response = APIClient().post(
            "/api/upload/utility",
            {"file": SimpleUploadedFile("broken.pdf", b"not a real pdf", content_type="application/pdf")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Could not read the PDF", response.data["detail"])

    def test_upload_rejects_empty_csv(self):
        response = APIClient().post(
            "/api/upload/utility",
            {
                "file": SimpleUploadedFile(
                    "utility.csv",
                    b"Meter ID,Billing Start Date,Billing End Date,Consumption,Unit\n",
                    content_type="text/csv",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("No rows could be read", response.data["detail"])

    def test_upload_rejects_unsupported_file_type(self):
        response = APIClient().post(
            "/api/upload/utility",
            {"file": SimpleUploadedFile("utility.txt", b"not,csv", content_type="text/plain")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported file type", response.data["detail"])

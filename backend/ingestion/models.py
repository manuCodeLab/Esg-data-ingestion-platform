from django.conf import settings
from django.db import models


class Tenant(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class DataSource(models.Model):
    class SourceType(models.TextChoices):
        SAP = "sap", "SAP Fuel & Procurement"
        UTILITY = "utility", "Utility Electricity"
        TRAVEL = "travel", "Corporate Travel"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="data_sources")
    name = models.CharField(max_length=255)
    source_type = models.CharField(max_length=32, choices=SourceType.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("tenant", "source_type", "name")

    def __str__(self):
        return f"{self.tenant.slug}:{self.source_type}:{self.name}"


class RawRecord(models.Model):
    class Status(models.TextChoices):
        CREATED = "created", "Created"
        NORMALIZED = "normalized", "Normalized"
        VALIDATED = "validated", "Validated"
        FAILED = "failed", "Failed"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="raw_records")
    data_source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name="raw_records")
    upload_batch_id = models.UUIDField(db_index=True)
    row_number = models.PositiveIntegerField()
    original_row = models.JSONField()
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.CREATED)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        unique_together = ("upload_batch_id", "row_number")


class EmissionRecord(models.Model):
    class Scope(models.TextChoices):
        SCOPE_1 = "scope_1", "Scope 1"
        SCOPE_2 = "scope_2", "Scope 2"
        SCOPE_3 = "scope_3", "Scope 3"

    class Status(models.TextChoices):
        PENDING = "pending_review", "Pending Review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        LOCKED = "locked", "Locked for Audit"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="emission_records")
    raw_record = models.OneToOneField(RawRecord, on_delete=models.CASCADE, related_name="emission_record")
    data_source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name="emission_records")
    scope = models.CharField(max_length=32, choices=Scope.choices)
    category = models.CharField(max_length=100)
    activity_type = models.CharField(max_length=100)
    normalized_quantity = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    normalized_unit = models.CharField(max_length=32, blank=True)
    normalized_data = models.JSONField(default=dict)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    analyst_comment = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_emission_records",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class ValidationIssue(models.Model):
    class Severity(models.TextChoices):
        INFO = "info", "Info"
        WARNING = "warning", "Warning"
        ERROR = "error", "Error"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="validation_issues")
    emission_record = models.ForeignKey(EmissionRecord, on_delete=models.CASCADE, related_name="validation_issues")
    rule_code = models.CharField(max_length=80)
    message = models.TextField()
    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.WARNING)
    field = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["severity", "rule_code"]


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATED = "created", "Created"
        EDITED = "edited", "Edited"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        LOCKED = "locked", "Locked"

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="audit_logs")
    emission_record = models.ForeignKey(EmissionRecord, on_delete=models.CASCADE, related_name="audit_logs")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=32, choices=Action.choices)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

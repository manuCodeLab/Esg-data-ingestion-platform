from django.contrib import admin

from .models import AuditLog, DataSource, EmissionRecord, RawRecord, Tenant, ValidationIssue


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "created_at")
    search_fields = ("name", "slug")


@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
    list_display = ("tenant", "name", "source_type", "created_at")
    list_filter = ("source_type", "tenant")


@admin.register(RawRecord)
class RawRecordAdmin(admin.ModelAdmin):
    list_display = ("tenant", "data_source", "row_number", "status", "created_at")
    list_filter = ("status", "data_source__source_type", "tenant")


class ValidationIssueInline(admin.TabularInline):
    model = ValidationIssue
    extra = 0


class AuditLogInline(admin.TabularInline):
    model = AuditLog
    extra = 0


@admin.register(EmissionRecord)
class EmissionRecordAdmin(admin.ModelAdmin):
    list_display = ("tenant", "data_source", "scope", "category", "normalized_quantity", "normalized_unit", "status")
    list_filter = ("scope", "status", "data_source__source_type", "tenant")
    inlines = [ValidationIssueInline, AuditLogInline]


@admin.register(ValidationIssue)
class ValidationIssueAdmin(admin.ModelAdmin):
    list_display = ("tenant", "emission_record", "rule_code", "severity", "field", "created_at")
    list_filter = ("severity", "rule_code", "tenant")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("tenant", "emission_record", "action", "user", "created_at")
    list_filter = ("action", "tenant")

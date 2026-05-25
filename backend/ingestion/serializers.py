from rest_framework import serializers

from .models import AuditLog, DataSource, EmissionRecord, RawRecord, ValidationIssue


class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = ["id", "name", "source_type"]


class RawRecordSerializer(serializers.ModelSerializer):
    data_source = DataSourceSerializer(read_only=True)

    class Meta:
        model = RawRecord
        fields = ["id", "data_source", "upload_batch_id", "row_number", "original_row", "status", "created_at"]


class ValidationIssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ValidationIssue
        fields = ["id", "rule_code", "message", "severity", "field", "created_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField()

    class Meta:
        model = AuditLog
        fields = ["id", "user", "action", "old_value", "new_value", "comment", "created_at"]


class EmissionRecordListSerializer(serializers.ModelSerializer):
    data_source = DataSourceSerializer(read_only=True)
    issue_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = EmissionRecord
        fields = [
            "id",
            "data_source",
            "scope",
            "category",
            "activity_type",
            "normalized_quantity",
            "normalized_unit",
            "status",
            "issue_count",
            "created_at",
        ]


class EmissionRecordDetailSerializer(serializers.ModelSerializer):
    data_source = DataSourceSerializer(read_only=True)
    raw_record = RawRecordSerializer(read_only=True)
    validation_issues = ValidationIssueSerializer(many=True, read_only=True)
    audit_logs = AuditLogSerializer(many=True, read_only=True)

    class Meta:
        model = EmissionRecord
        fields = [
            "id",
            "data_source",
            "raw_record",
            "scope",
            "category",
            "activity_type",
            "normalized_quantity",
            "normalized_unit",
            "normalized_data",
            "status",
            "analyst_comment",
            "reviewed_at",
            "locked_at",
            "created_at",
            "updated_at",
            "validation_issues",
            "audit_logs",
        ]


class ReviewActionSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True)

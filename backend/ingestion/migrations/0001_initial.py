# Generated for the ESG ingestion platform scaffold.
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Tenant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255)),
                ("slug", models.SlugField(unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name="DataSource",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255)),
                ("source_type", models.CharField(choices=[("sap", "SAP Fuel & Procurement"), ("utility", "Utility Electricity"), ("travel", "Corporate Travel")], max_length=32)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="data_sources", to="ingestion.tenant")),
            ],
            options={"unique_together": {("tenant", "source_type", "name")}},
        ),
        migrations.CreateModel(
            name="RawRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("upload_batch_id", models.UUIDField(db_index=True)),
                ("row_number", models.PositiveIntegerField()),
                ("original_row", models.JSONField()),
                ("status", models.CharField(choices=[("created", "Created"), ("normalized", "Normalized"), ("validated", "Validated"), ("failed", "Failed")], default="created", max_length=32)),
                ("error_message", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("data_source", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="raw_records", to="ingestion.datasource")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="raw_records", to="ingestion.tenant")),
            ],
            options={"ordering": ["-created_at", "-id"], "unique_together": {("upload_batch_id", "row_number")}},
        ),
        migrations.CreateModel(
            name="EmissionRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("scope", models.CharField(choices=[("scope_1", "Scope 1"), ("scope_2", "Scope 2"), ("scope_3", "Scope 3")], max_length=32)),
                ("category", models.CharField(max_length=100)),
                ("activity_type", models.CharField(max_length=100)),
                ("normalized_quantity", models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True)),
                ("normalized_unit", models.CharField(blank=True, max_length=32)),
                ("normalized_data", models.JSONField(default=dict)),
                ("status", models.CharField(choices=[("pending_review", "Pending Review"), ("approved", "Approved"), ("rejected", "Rejected"), ("locked", "Locked for Audit")], default="pending_review", max_length=32)),
                ("analyst_comment", models.TextField(blank=True)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("locked_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("data_source", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="emission_records", to="ingestion.datasource")),
                ("raw_record", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="emission_record", to="ingestion.rawrecord")),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reviewed_emission_records", to=settings.AUTH_USER_MODEL)),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="emission_records", to="ingestion.tenant")),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
        migrations.CreateModel(
            name="ValidationIssue",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("rule_code", models.CharField(max_length=80)),
                ("message", models.TextField()),
                ("severity", models.CharField(choices=[("info", "Info"), ("warning", "Warning"), ("error", "Error")], default="warning", max_length=16)),
                ("field", models.CharField(blank=True, max_length=100)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("emission_record", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="validation_issues", to="ingestion.emissionrecord")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="validation_issues", to="ingestion.tenant")),
            ],
            options={"ordering": ["severity", "rule_code"]},
        ),
        migrations.CreateModel(
            name="AuditLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(choices=[("created", "Created"), ("edited", "Edited"), ("approved", "Approved"), ("rejected", "Rejected"), ("locked", "Locked")], max_length=32)),
                ("old_value", models.JSONField(blank=True, null=True)),
                ("new_value", models.JSONField(blank=True, null=True)),
                ("comment", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("emission_record", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="audit_logs", to="ingestion.emissionrecord")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="audit_logs", to="ingestion.tenant")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]

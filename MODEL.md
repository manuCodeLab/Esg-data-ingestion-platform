# Model Design

## Tenant

Represents a customer workspace. All ingestion, records, validation issues, and audit logs are scoped to a tenant through foreign keys. The current API uses `X-Tenant` to choose the tenant slug.

## DataSource

Defines an enterprise source connected to a tenant. Supported source types are SAP fuel/procurement, utility electricity, and corporate travel. DataSource provides lineage from an emission record back to the upload channel.

## RawRecord

Stores the original CSV row exactly as received in `original_row`, plus row number and upload batch id. This preserves defensibility during audit review and lets normalized records be traced to source evidence.

## EmissionRecord

The normalized review object. It stores scope, category, activity type, normalized quantity/unit, normalized structured fields, status, reviewer, and timestamps. Statuses support pending review, approved, rejected, and locked for audit.

## ValidationIssue

Stores suspicious-record findings separately from records. This makes validation transparent and allows multiple issues per record without mutating normalized values.

## AuditLog

Append-only action history for created, edited, approved, rejected, and locked events. Each entry captures user, timestamp, old value, new value, and comment where available.

## Relationships

Tenant has many DataSources, RawRecords, EmissionRecords, ValidationIssues, and AuditLogs. A RawRecord has one EmissionRecord. An EmissionRecord has many ValidationIssues and AuditLogs.

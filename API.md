# API Documentation

Base URL: `/api`

Use `X-Tenant: demo` to scope requests.

## Uploads

`POST /upload/sap`, `POST /upload/utility`, and `POST /upload/travel`

Content type: `multipart/form-data`

Field: `file`

Response:

```json
{
  "batch_id": "uuid",
  "created_count": 5,
  "record_ids": [1, 2, 3]
}
```

## Records

`GET /records`

Filters:

- `source`: `sap`, `utility`, `travel`
- `scope`: `scope_1`, `scope_2`, `scope_3`
- `status`: `pending_review`, `approved`, `rejected`, `locked`

`GET /records/:id` returns normalized data, raw row, validation issues, and audit logs.

## Review Actions

`POST /records/:id/approve`

`POST /records/:id/reject`

`POST /records/:id/comment`

`POST /records/:id/lock`

Body:

```json
{
  "comment": "Reviewed against utility invoice."
}
```

## Dashboard

`GET /dashboard`

Returns total, pending, approved, rejected, suspicious, and rollups by status, scope, and source.

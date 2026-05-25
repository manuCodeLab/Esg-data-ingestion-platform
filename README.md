# ESG Data Ingestion and Review Platform

Production-oriented ESG ingestion prototype using Django REST Framework, PostgreSQL, React, and Material UI.

## Run Locally

```bash
docker compose up --build
```

Backend: `http://localhost:8000/api`

Frontend: `http://localhost:5173`

Upload CSVs from `sample_data/`, or PDFs that contain selectable table text with the same headers, from the frontend upload controls.

## Backend Without Docker

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

## Frontend Without Docker

```bash
cd frontend
npm install
npm run dev
```

## API

All endpoints accept `X-Tenant: demo`; if omitted, the backend uses `demo`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/upload/sap` | Upload SAP fuel/procurement CSV/PDF as multipart `file` |
| POST | `/api/upload/utility` | Upload utility electricity CSV/PDF as multipart `file` |
| POST | `/api/upload/travel` | Upload corporate travel CSV/PDF as multipart `file` |
| GET | `/api/records` | List emission records; filters: `source`, `scope`, `status` |
| GET | `/api/records/:id` | Retrieve raw data, normalized data, validation issues, audit trail |
| POST | `/api/records/:id/approve` | Approve with optional JSON `{ "comment": "..." }` |
| POST | `/api/records/:id/reject` | Reject with optional JSON `{ "comment": "..." }` |
| POST | `/api/records/:id/comment` | Add or replace analyst comment |
| POST | `/api/records/:id/lock` | Lock a reviewed record for audit |
| GET | `/api/dashboard` | Dashboard totals and rollups |

## Deployment

### Render Backend

1. Create a Render Blueprint from `render.yaml`, or create a Python web service with root directory `backend`.
2. Add a PostgreSQL database and set `DATABASE_URL`.
3. Set `ALLOWED_HOSTS` to the Render service host.
4. Set `CORS_ALLOWED_ORIGINS` to the Vercel frontend URL.
5. Build command: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`.
6. Start command: `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`.

### Vercel Frontend

1. Import the repository with root directory `frontend`.
2. Set `VITE_API_BASE_URL` to the Render backend `/api` URL.
3. Set `VITE_TENANT` to the tenant slug to use initially.
4. Deploy with `npm run build`; output directory is `dist`.

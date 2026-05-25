# Tradeoffs

1. Authentication and role-based authorization are not implemented. Tenant selection uses a request header so the ingestion and review workflows remain easy to run locally.
2. Emission factor libraries and CO2e calculations are not implemented. Those require jurisdiction, year, factor source, market/location method, and evidence controls.
3. File storage, async jobs, and idempotent upload deduplication are not implemented. Production ingestion should move parsing to a queue and persist uploaded source files.

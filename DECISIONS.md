# Decisions

## Assumptions

- Tenant selection is header-based (`X-Tenant`) for the prototype. A production system would derive tenant from authentication claims.
- Uploads are CSV files because SAP exports, utility portal exports, and travel provider reports commonly support CSV.
- Emission factors and CO2e calculations are intentionally outside this implementation; the platform focuses on ingestion, normalization, validation, and review readiness.

## Source Choices

- SAP fuel/procurement rows are modeled around plant, material, fuel type, quantity, unit, and posting date.
- Utility rows are modeled around meter, billing period, consumption, and energy unit.
- Travel rows support flight, hotel, and ground transport exports with route, distance, class, and hotel nights.

## Normalization

- Electricity is normalized to kWh. MWh is multiplied by 1000.
- Liquid fuels are normalized to liters where source units are liters or kiloliters.
- Travel distance is normalized to kilometers; miles are multiplied by 1.60934.
- Scope mapping is rule-based: diesel, petrol, gasoline, and natural gas map to Scope 1; purchased electricity maps to Scope 2; flights, hotels, ground transport, and procurement map to Scope 3.

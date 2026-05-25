# Sources and Production Notes

## Research Notes

- SAP procurement and fuel exports often vary by module, but plant, material description, quantity, unit, and posting date are common operational fields.
- Utility portal exports often use meter/account identifiers, billing periods, consumption, and units such as kWh or MWh.
- Corporate travel exports from tools such as Concur/Navan commonly include trip type, origin/destination, cabin or travel class, distance, and lodging nights.

## Real-World Format Risks

- SAP units may include local language abbreviations, custom material codes, reversal rows, and mixed currencies for procurement-like rows.
- Utility data may include demand charges, estimated reads, interval data, renewable tariff attributes, and corrected bills.
- Travel exports may contain airport names instead of IATA codes, multi-leg itineraries, missing distance, rail-specific classes, and hotel stays without city-normalized geography.

## What Would Break In Production

- Large uploads are parsed synchronously in the request/response cycle.
- The same file can be uploaded repeatedly without deduplication.
- Tenant security is not enforced through authentication.
- Validation thresholds are static and should become tenant-, facility-, and source-specific.
- No immutable file evidence is stored alongside RawRecord rows.

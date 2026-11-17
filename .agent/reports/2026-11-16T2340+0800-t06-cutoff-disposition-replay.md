# Exchange disposition replay for the November 16 close

Contabo isolated staging re-fetched both announced-disposition CSVs. Their SHA-256 and lengths matched the original 21:28 observation receipt. The verifier recovered two listed and five OTC in-effect notices for the November 16 session. The rows were interpreted using their inclusive effective period. The same replay refused the later acquisition clocks when evaluated against 21:30. See the [staged observation receipt](../../docs/operations/2026-11-16/vnext/t06-cutoff-disposition-replay.json). [TWSE publisher dataset](https://data.gov.tw/dataset/29082) · [TPEx publisher dataset](https://data.gov.tw/dataset/11396)

The release still needs writer-side current-rights validation and the remaining suspension coverage. Missing or empty sources keep the existing qualification gap. The TWSE stopped-trading list covers financial or operational anomalies and directs capital reduction and other non-anomaly stops to MOPS disclosures. [TWSE scope](https://www.twse.com.tw/zh/listed/violations/stop.html)

Contabo Node 22.14.0 and Next.js 16.3.4 passed 15 related tests, focused ESLint, TypeScript, and the full production build with 92 static outputs.

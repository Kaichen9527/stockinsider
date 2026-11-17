# TPEx explicit stopped-trading evidence

TPEx 11736 is now bound to the existing licensed source queue and writer. Only the explicit stopped-trading field of a validated same-session report supplies a candidate suspension exclusion. Candidate preflight retains the ACK, calendar, rights and same-market identity. An absent row or empty file leaves the relevant eligibility check unknown. [TPEx dataset](https://data.gov.tw/dataset/11736)

PostgreSQL replay found one stopped security in the November 16 official report. The report used for this run was obtained after the original cutoff. The separate signed HTTP test used fixture records and verified the type distinction, private artifact readback and duplicate ready receipt. [Verification receipt](../../docs/operations/2026-11-17/vnext/t06-tpex-stopped-trading-queue.json)

TWSE publishes separate state categories in its market feed. The A05 17:30 product includes a suspension field and is a candidate for entitlement and scope verification. The 22:00 master and 23:30 limit file miss the current ranking cutoff. [TWSE status specification](https://www.twse.com.tw/docs1/data01/market/public_html/1030620-1030601626-2.pdf) · [TWSE A05 product](https://eshop.twse.com.tw/zh/product/detail/cfec9a1470e448ec91bfde006db361e8)

All 28 relevant Node tests, focused ESLint, TypeScript and the production build passed from isolated Contabo staging.

# T18 fixed history chart attribution

The same genuine production archive reached the fixed A/B/A sequence and automatic fault rollback on Contabo again. A's detail API passed. The new page checkpoint identified additional links in A's streamed HTML with every expected link present. The run retained the native HOLD, cleaned the isolated processes and workspace, and preserved production signatures. [Native evidence](../../docs/operations/2026-11-15/vnext/contabo-t18-real-detail-extra-link.json)

Both fixed release trees have identical Git blobs for the historical chart renderer, date validation and detail page component. Each of the daily, monthly and PE/PB charts contributes one exact TradingView attribution when it has renderable data. The verifier now computes that count and checks the URL and attributes inside each corresponding chart section. It still compares the research-source link multiset across the complete HTML, including streamed fragments. Missing or changed source links and unrelated external links remain failures.

Thirteen scoped Contabo tests passed, including the actual PostgreSQL and loopback proxy fixtures and populated, empty, swapped and duplicated chart links. The next real run needs to confirm both fixed detail pages with this verifier. [Scoped test receipt](../../docs/operations/2026-11-15/vnext/t18-pinned-chart-attribution-source-checks.json)

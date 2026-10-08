# Official insider disclosure parser and bounded coverage

Existing authenticated source-sync and writer fencing stay unchanged. Fixed TWSE holding L/P and transfer L plus reviewed TPEx holding11_O/transfer12_O are separate datasets; P is not OTC. A fixed-endpoint-only 12MiB response/50,000-row limit and15-second no-redirect request bound do not change general public-source grants.

Parse monthly holdings using 資料年月; preserve 出表日期 as date-only, publishedAt null. Transfer shares use 轉讓股數 with blank null, own/trust holdings separate. A declaration/snapshot is never a completed trade, bullish/bearish confirmation or aggregate ownership. Placeholder/invalid identities do not become events. Unknown schemas fail visibly.

Full-market processing uses a durable dataset-scoped hash/offset cursor,500raw rows per run; symbol-specific processing filters the full bounded response without a60-row truncation. Receipt reports total/matched/processed/excluded/remaining/nextOffset and snapshot reset. Persist cursor only after durable document upsert, never after failure. Concurrent replay can duplicate idempotent upserts but cannot claim full coverage; rapidly changing snapshots can reset before completion and must remain visibly partial. No new scheduling or official authority.

Required: reviewed67TWSE+26TPEx selected records, transfer blank and trust quantities, placeholder, invalid schema, period/date precision, page beyond7500/restart/replay/snapshot change, oversized/redirect/status response. No VM official live success or raw-hash recomputation from selected relays claimed.

## Review correction: complete schema before selection

Each of the five fixed endpoints must validate required own keys and string types for identity, reporting clock and quantity/method fields across the entire bounded response before symbol filtering or page selection. Missing/renamed keys and wrong primitive types fail that dataset; neither its documents nor cursor may advance. Present invalid identity values may be excluded only after schema/value validation. The known transfer placeholder requires present empty identity and quantity fields plus a valid date; absent fields are not a placeholder.

Any explicit dataset failure or remaining response pages takes precedence over empty or duplicate success even when zero new documents are written. Existing auth/parser/timeout failures remain failures. The guarded route must return a non-success status and record succeededAt null for incomplete runs; completed duplicates and completed empty results remain successful.

# Release Gate Report

- status: **fail**
- mode: `full`
- change: `stock-insider-opportunity-engine`
- started_at: 2026-03-01T06:22:19.085Z
- finished_at: 2026-03-01T06:22:32.231Z
- commit: 3864924

## Checks

- [x] openspec validate --all (1041ms)
- [x] openspec apply progress (stock-insider-opportunity-engine) (0ms)
- [x] npm run test:scraper (808ms)
- [x] python compile checks (166ms)
- [ ] db verify (staging/prod) (161ms)
```text
DB release readiness check failed: Could not connect to configured Supabase DB host(s).


> db:verify
> node scripts/verify_db_release_readiness.js

Failed db.mgqpxfbdhmiygdytgswi.supabase.co: getaddrinfo ENOTFOUND db.mgqpxfbdhmiygdytgswi.supabase.co
```
- [x] web lint (1654ms)
- [x] web build (3679ms)

## Blocking Issues
- db verify (staging/prod) failed

## Non-blocking Warnings
- Change 'stock-insider-opportunity-engine' is archived; skipped 22/22 active-change progress check
- Next.js workspace root warning due to multiple lockfiles
- API smoke: GET /api/dashboard/daily returned 500
- API smoke: GET /api/recommendations returned 500
- API smoke: POST /api/internal/recommendation-run returned 500
- API smoke: POST /api/internal/line-dispatch returned 500
- API smoke: POST /api/internal/monitoring-check returned 500
- API smoke: POST /api/internal/pipeline-run returned 500

## Artifacts
- json: `/Users/kaerchen/Desktop/20_stock/StockInsider/.agent/reports/2026-03-01T06-22-19-085Z-release-gate.json`
- markdown: `/Users/kaerchen/Desktop/20_stock/StockInsider/.agent/reports/2026-03-01T06-22-19-085Z-release-gate.md`
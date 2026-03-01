---
description: Run unified release gate checks and emit a structured readiness report
---

Run release gate checks for StockInsider and output a report.

## Input

- `/opsx:test` -> full release gate
- `/opsx:test --quick` -> skip build + `POST /api/internal/line-dispatch` smoke
- `/opsx:test --report-only` -> print latest report only

## Steps

1. Execute `.agent/scripts/opsx-test.js` with provided flags.
2. Read report summary from `.agent/reports/latest-release-gate.json`.
3. If `overall_status=fail`, list `blocking_issues` first.
4. If pass, show warnings and recommend archive/deploy sequence.

## Blocking policy

The workflow is blocked if any blocking check fails:
- OpenSpec validation
- Apply progress mismatch (`22/22`)
- Scraper unit tests
- Python compile checks
- DB verify (`npm run db:verify`) when DB env is configured
- Web lint
- Web build (unless quick mode)

## Non-blocking policy

Warnings only:
- API smoke failures in local/restricted environments
- lockfile root warning from Next.js
- OpenSpec telemetry/posthog network errors

## Artifact outputs

- JSON report: `.agent/reports/latest-release-gate.json`
- Markdown report: `.agent/reports/latest-release-gate.md`

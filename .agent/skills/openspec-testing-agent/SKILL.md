---
name: openspec-testing-agent
description: Release gate testing agent for StockInsider. Use when the user asks to run pre-release checks, generate a gate report, or verify readiness before archive/deploy.
license: MIT
metadata:
  author: local
  version: "1.0"
---

Run a unified release gate and produce a machine-readable + human-readable report.

## Intent

Use this skill to answer:
- "Are we release-ready?"
- "Run all tests before archive"
- "Generate a pre-release report"

## Command Interface

- Full gate:
  - `.agent/scripts/opsx-test.js`
- Quick gate (skip web build and `POST /api/internal/line-dispatch` smoke):
  - `.agent/scripts/opsx-test.js --quick`
- Report only (print latest report):
  - `.agent/scripts/opsx-test.js --report-only`

## Blocking checks

1. `openspec validate --all`
2. `openspec instructions apply --change stock-insider-opportunity-engine` with `22/22 complete`
3. `npm run test:scraper`
4. `python3 -m py_compile scraper/*.py scraper/tests/*.py`
5. `npm run db:verify` (blocking when DB env is configured)
6. `cd web && npm run lint`
7. `cd web && npm run build` (unless `--quick`)

## Optional smoke checks (non-blocking)

In full mode, the script attempts:
- Start web dev server at `127.0.0.1:3005`
- `GET /api/dashboard/daily`
- `GET /api/recommendations`
- `POST /api/internal/recommendation-run`
- `POST /api/internal/line-dispatch`
- `POST /api/internal/monitoring-check`
- `POST /api/internal/pipeline-run`

In `--quick` mode, the script still runs smoke checks but skips `POST /api/internal/line-dispatch`.

Smoke failures are recorded as warnings by default to avoid false-negative release blocks in restricted/local environments.

## Output artifacts

- JSON: `.agent/reports/<timestamp>-release-gate.json`
- Markdown: `.agent/reports/<timestamp>-release-gate.md`
- Latest pointers:
  - `.agent/reports/latest-release-gate.json`
  - `.agent/reports/latest-release-gate.md`

## Result contract

- `overall_status`: `pass|fail`
- `checks[]`: `name`, `status`, `duration`, `error_summary`
- `blocking_issues[]`
- `non_blocking_warnings[]`
- `artifacts`: report paths, timestamp, change name, mode

## Recommended usage sequence

1. Run full gate.
2. Fix blocking issues if any.
3. Re-run full gate.
4. Archive completed OpenSpec change.

# `tw-story-alpha-radar` Legacy Mapping and Retirement Plan

## Canonical Mapping

- `frontend-dashboard` + `insight-dashboard`
  Canonical target: `research-workbench-and-reports`
  Status: `compat-only`
- `stock-strategy` + `recommendation-strategy-engine`
  Canonical target: thesis lifecycle + technical timing gate
  Status: `compat-only`
- `market-analysis` + `market-intelligence`
  Canonical target: TW market/theme regime intelligence
  Status: `compat-only`
- `line-integration` + `line-personalized-alerts`
  Canonical target: downstream delivery surface
  Status: retained, but no longer the product core

## Compatibility Rules

- Legacy specs remain in the repo until governance/data-contract verification stays green.
- New implementation work must target the `tw-story-alpha-radar` capability set first; legacy specs are only read for backward-compatibility and ops context.
- `/api/radar/hot` is the product-facing route for the canonical `three_day` window. This mapping is intentional and should be validated in tests to avoid semantic drift.

## Retirement Trigger

Retire or archive the overlapping legacy specs only after all of the following are true:

- Published recommendations pass traceability checks against `story_candidates`, `story_evidence_items`, and `valuation_cases`
- Research memo outputs carry explicit traceability metadata for daily/hot/weekly/deep-dive views
- External profile execution is restricted to the vendored allowlist and mapped internal roles
- Contradictions and weak promotion attempts consistently create review queue items instead of silently promoting

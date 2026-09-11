# Financial parser valid-fact closure

## Outcome

- Added operator-installed, SHA-256-pinned Taiwan IFRS taxonomy support to the
  credential-free, network-isolated parser service.
- Preserved all document-level Arelle findings while allowing only individually
  valid, valuation-allowlisted facts to cross the parser boundary.
- Added a second-parser equality check for QName, context, unit and normalized
  numeric value before a fact can be submitted.
- Added an additive v8 completion RPC which binds each structurally admitted
  fact to its immutable document locator. The worker then runs the existing
  peer-aware unit, PIT and accounting-consistency validator; Arelle `xValid`
  alone is deliberately not promoted into an accounting validation receipt.
  The v7 service-role completion entrypoint is revoked.
- No production migration, document retry, fact write or deployment was run.

## Real filing evidence

The existing hash-verified TSMC 2026 Q2 iXBRL document was tested locally with
the official `tifrs-20260331` taxonomy archive whose reviewed SHA-256 is pinned
by the installer.

- Arelle model facts: 1,228 (prior diagnostic)
- Document validation findings: 801, retained as a partial receipt
- Individually valid, valuation-allowlisted Arelle manifest entries: 157
- Bounded MOPS parser period facts: 31
- Exact QName/context/unit/value matches accepted for submission: 31
- Accepted keys include revenue, gross profit, operating income, pretax income,
  net income, attributable income, basic/diluted EPS, cash, assets and equity.

This proves parser extraction and cross-validation, not production database
ingestion. A reviewed migration and controlled receipt retry are still required
before the production fact count can change.

## Verification

- Python Arelle tests: 4/4
- Focused TypeScript parser/manifest/document tests: 8/8 (one environment-only
  socket test skipped because the local VPS interpreter was not configured)
- Migration contract tests: passed
- V3 reviewed migration plan parity: 10/10
- TypeScript: passed
- Candidate runtime/contracts: 29 evidence tests, 199 runtime tests (one
  environment-only skip), and 38 contract tests passed.
- Lint (`--quiet`) and production build: passed. Full independent review remains
  a release gate.

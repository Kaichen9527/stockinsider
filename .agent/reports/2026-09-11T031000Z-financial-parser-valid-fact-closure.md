# Financial parser valid-fact closure

## Outcome

- Added operator-installed, SHA-256-pinned Taiwan IFRS taxonomy support to the
  credential-free, network-isolated parser service.
- Preserved all document-level Arelle findings and now fails the fact manifest
  closed whenever complete instance validation reports any structural error.
- Added a second-parser equality check for QName, context, issuer entity,
  period, dimensions, unit and normalized numeric value before a fact can be
  submitted.
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
- Complete instance validation findings: 893, retained as a partial receipt
- Typed valuation candidates observed before the document gate: 70
- Facts emitted for submission: **0**, because this filing is not structurally
  clean under the pinned taxonomy/runtime.

This proves the corrected validator no longer turns a partially validated
document into accepted financial evidence. It does not prove production
database ingestion. A structurally clean official instance (or a separately
validated official structured/PDF path), reviewed migration and controlled
receipt retry are still required before the production fact count can change.

## Verification

- Python Arelle tests: 5/5, including wrong period type and conflicting
  accuracy attributes.
- Focused TypeScript parser/manifest/document tests: 8/8 (one environment-only
  socket test skipped because the local VPS interpreter was not configured)
- Migration contract and real local PostgreSQL state-machine tests: passed.
- V3 reviewed migration plan parity: 10/10
- TypeScript: passed
- Candidate runtime/contracts: 29 evidence tests, 199 runtime tests (one
  environment-only skip), and 38 contract tests passed.
- Lint (`--quiet`) and production build: passed. Full independent review remains
  a release gate.

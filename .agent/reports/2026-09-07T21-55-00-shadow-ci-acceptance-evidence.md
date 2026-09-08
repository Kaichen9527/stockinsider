# Shadow replay and model-runner pin repair evidence

Date: 2026-09-07

## Shadow replay

- `web/src/lib/shadow-policy-v2.test.ts`: PASS (5/5). Ordered replay input is
  manifest/final-publication-bound; altered stage input is rejected; duplicate,
  preliminary, weekend and backtest rows do not advance the qualifying counter.
- `scripts/shadow-replay-v5-migration.test.mjs`: PASS (1/1) against a fresh
  local PostgreSQL cluster. The additive table accepts one verifier timestamp
  but rejects changes to payload identity and non-final/non-official rows.

## CI host pin

- Measured `/Applications/ChatGPT.app/Contents/Resources/codex` version
  `codex-cli 0.153.4`, SHA-256
  `a30ec314bbd0e3721632234d07db7c99855db3b9f1e32dbe8c791947f07e7629`,
  CodeDirectory SHA-256
  `864aa1693ffed7034fd3d1a723386b250aa1627d4b244a0b08da440578827463`.
- `codesign --verify --deep --strict` and `spctl -a -vv` passed; Team ID is
  `2DC432GLL2` and the bundle is `Notarized Developer ID`.
- `npm run test:model-runner-v3`: PASS (17/17).
- `node --test scripts/opportunity-v3/protected-external-gate-worker.test.mjs`:
  PASS (9/9). The aggregate now requires model-runner success and its immutable
  artifact; a skipped, missing or failed model-runner job cannot satisfy root.

## Protected-base boundary

The live protected model oracle intentionally executes only model-runner bytes
already present on the pull-request base. A protected-base owner must register
and independently review the exact v3.15 successor before the changed subject
fixture can receive a live-oracle receipt. This report does not claim that
protected-base action, PR review, deployment, migration application, or any
production write occurred.

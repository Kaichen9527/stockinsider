# V3.17 Architecture repair-closure review

Date: 2026-08-21

Review authority: independent, read-only closure after the V3.17 Requirements
catalog-identity repair. This review covers the exact source and evidence carrier
below. It grants no production data write, runtime activation,
deployment, password reset, credential rotation, LINE, dispatch, automatic trading
or Promotion authority.

Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `01aedbab4ab0035712439b86a327313c40d3e481`
- Requirements implementation commit: `ae8ad6efe11212e4eb67100f0541ee555683a251`
- Requirements evidence carrier: `95bd864d980e48fa2aa60431af7e5de7f54ece47`
- Final repair-closure commit/tree: `95bd864d980e48fa2aa60431af7e5de7f54ece47` / `95dac017c8223f1bcbec7a2f6b1ff15c9dc7993b`
- Full reviewed implementation range: `01aedbab4ab0035712439b86a327313c40d3e481..95bd864d980e48fa2aa60431af7e5de7f54ece47`
- Active graph: `1549b1e456e9c9dc1e72f3a0482c3c1fd286e1fb7e4a49457c38f9613d2426ae`

## Architecture closure

The V3.17 design separates three independent concerns that previously collapsed
into an empty landing page: source-led research visibility, per-stock research
readiness, and executable action authority. The Decision Envelope remains the only
authority for a formal action. `ResearchNextStep` is an explicit, bounded routing
contract, while `ResearchSnapshot` is a typed immutable detail representation. A
global integrity, runtime, manifest, migration, release-identity or frozen-lineage
mismatch disables actions but keeps checksum-valid research visible as read-only.
One stock's missing valuation or financial data now remains its own waterfall gate;
it cannot suppress unrelated source-backed research.

The producer ordering is closed and deterministic: frozen acquisition is combined
with persisted authority before facts, valuation, technical inputs, official liquidity,
decision and compact projection are calculated. This removes the prior one-run lag
where newly acquired facts were only visible to a later decision. It retains the
V3.16.21 immutable-acquisition rules: completed request keys are reused, partial
retry is bounded to missing keys, response conflicts quarantine, true `fetchedAt`
is never backdated, and later knowledge cannot leak into a prior cohort.

The public path remains projection-only. Landing cards use a compact, validated
payload and preserve the exact revision link. Detail reads the same revision and,
when the cited formal brief is unavailable, renders the validated research snapshot
instead of falling back to an empty legacy page. Snapshot and card must agree on
symbol, price and next step. Published source provenance permits only bounded HTTPS
URLs, diagnostics stay redacted, and no route performs discovery, deep research or
mutation on a page request.

The source boundary is intentionally narrow. Authorized document revision → entity
link → candidate event is the only nomination path. Official market data enriches
only the bounded candidate set. InvestAnchors' paid material and Telegram content
are excluded from acquisition, persistence, model input and public UI; source
connectors instead surface terminal capability/authorization outcomes. This retains
the legal and provenance boundary while preserving evidence links for authorized
public sources.

The CSS repair removes a cascade bypass rather than painting a one-off button. The
global anchor inheritance rule is gone and accent tokens are declared in the active
theme so semantic Link/Button variants yield measurable foreground/background
contrast in both themes. The browser test exercises desktop/mobile, keyboard and
same-revision navigation together with the light/dark contrast calculation.

Loop control is now a versioned current-release state machine rather than a
historical prose queue. It derives the active graph from the reviewed tree and
keeps password reset and credential rotation outside the action queue. This is a
control-plane-only change: no database role, schema privilege, public API or runtime
scheduler boundary is expanded.

The repair closes a control-plane identity drift only: the catalog was expanded
for V3.17 while two canonical tags and the executable oracle still identified the
prior 5,659-byte blob. The repaired values bind the exact current 5,829-byte
catalog; no source, decision, runtime, schema or presentation dependency is
introduced by this closure.

The full local product/runtime diagnostic is green: typecheck, lint and production
build PASS; core 61/61; product correctness 121/121; migration 61/61; legacy 2/2;
Playwright 9/9; performance 5/5. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`; this Architecture PASS does
not make a future-return, minimum-buy-card or Promotion claim.

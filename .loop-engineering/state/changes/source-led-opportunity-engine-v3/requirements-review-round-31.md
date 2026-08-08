# Requirements Gate Round 31

**Verdict: `CHANGES_REQUIRED`**

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 1 |
| P2 | 0 |

Requirements Gate does not pass. Architecture Gate remains locked, and implementation remains unauthorized.

## Immutable evidence

- Baseline commit: `12c131aa50ca53268878e9f025973533ac100c49`
- Baseline tree: `c90ff9b693a6c8e0acb3d23b7068a231347e318c`
- Review HEAD: `e9177b2641a2b58afbf1f2c4a094ba481bc06566`
- HEAD tree: `62368dc4e379cf24fe7bfe2f56589ac3340ce171`
- Direct parent: `89639ba4e7afbe708f4b24585c1094b650c51d38`, matching the expected parent.
- Merge-base: exactly `12c131aa50ca53268878e9f025973533ac100c49`.
- Range `12c131a..e9177b2`: 36 commits ahead, zero behind, zero merges; all 36 range commits have exactly one parent.
- Change path: `.loop-engineering/state/changes/source-led-opportunity-engine-v3`
- Change-path tree: `6b538fa099ed4851ae716e744e56c913ba8cc878`, containing 71 blobs.
- Active normative catalog: 32 artifacts, mechanically selected by `HEAD:.loop-engineering/state/changes/source-led-opportunity-engine-v3/design.md:L28-L32`.
- Gate threshold is zero P0/P1: `HEAD:.loop-engineering/policy.yaml:L6-L7`; `HEAD:.specify/memory/constitution.md:L23-L29`.
- Requirements rounds 1–29 and Architecture reports were not opened. Round 30 alone was read for closure verification.
- Review used immutable Git objects only, without network or mutation of files, refs, index, session state, process state, or external resources.

## P1 finding

### P1-1 — The active version graph still contains two stale runtime edges

The runtime owner is currently `opportunity-runtime-v3.9`:

- `HEAD:.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:L3`
- Current graph root: `HEAD:.loop-engineering/state/changes/source-led-opportunity-engine-v3/design.md:L28-L32`

Two active normative files still delegate behavior to `runtime-transaction-contract.md v3.8`:

1. Control-plane failure precedence cites v3.8: `HEAD:.loop-engineering/state/changes/source-led-opportunity-engine-v3/control-plane-contract.md:L73`.
2. Evaluation-lock derivation cites v3.8: `HEAD:.loop-engineering/state/changes/source-led-opportunity-engine-v3/shadow-evaluation-contract.md:L14`.

This is not an ignorable editorial mismatch. The design requires every active contract-name/version prose edge to equal its owner header and declares stale references a meta-test failure. `GOV-004` independently requires runtime v3.9 and rejects stale graph edges:

- `HEAD:.loop-engineering/state/changes/source-led-opportunity-engine-v3/design.md:L30-L32`
- `HEAD:.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.md:L284`

Therefore the active graph is not single-valued, and the required acceptance oracle cannot pass against HEAD. Implementation may not choose to treat v3.8 as equivalent to v3.9.

## Round 30 closure

| Round 30 P1 | Round 31 result |
|---|---|
| Corporate-action-adjusted price authority was unconstructible | **Closed.** Raw price accepts no adjusted/action fields; the separate snapshot branch defines six compiled official feeds, complete three-feed evidence, empty-snapshot no-action proof, pre/post factor math, cutoff/tie/correction rules, 64/65 bounds, typed union RPC, normalized DDL, evidence propagation and executable fixtures. |
| Source and seven-authority key enumeration was globally unbounded | **Closed.** Source families and all seven authority families now have immutable registries, family-wide locks, bound+1 registry probes before every cutoff/status/eligibility filter, per-stream `LIMIT 65`, exact indexes and future-only-prefix fixtures. |
| Non-blinded nonce and audit effects contradicted | **Closed.** Successful standalone nonce consumption atomically writes nonce plus nonce audit; later append failure retains exactly that pair, success adds one append audit; blinded failures roll back all invocation writes; machine routes remain one-call/no-nonce with zero failure writes. |
| Mechanical active-version graph contained stale edges | **Not closed overall.** Round 30's specifically cited calendar/runtime/source-dataset edges were repaired, and headers/static tuple/manifests/public literals now agree. However, the two active runtime-v3.8 prose edges above still make `GOV-004` fail. |

## Independent canonical and meta checks

| Check | Result |
|---|---|
| Active normative catalog | 32 artifacts |
| Acceptance JSON | Version `1.30.0`; declared/actual/unique IDs `227/227/227` |
| Markdown mirror | 227 unique rows; zero malformed rows; zero order or semantic mismatches |
| Provider fact allowlist | 18 unique fact/scope/unit rows; 1,645 canonical bytes; SHA-256 `fe78e0f8c5b0846f822f72c6b2356cac35ed5c00dd0bcd06f9a75b7c5b21d3f7` |
| Price/action allowlist | 2 exchanges; 313 canonical bytes; SHA-256 `48fa54ee9f0e3a0b888ac0dc17eda8ad5bb746106a6fe4395eb50a5865e4e44e` |
| Runtime static tuple | 36 members; 36 unique; exact ASCII order |
| Manifest catalog | 19 unique kinds |
| Public RPC catalog | 31 unique functions |
| Runner-ingestion routes | 7 unique, no-nonce routes |
| Human-authority routes | 11 unique routes |
| Current version-root tokens | Each expected root is single-valued; acceptance literal is only `1.30.0` |
| Contract-name/version prose edges | **Fail:** 2 runtime v3.8 edges against runtime v3.9 |

The active corpus contains no old 161-byte price wire, `market-price-provider-allowlist-v3.0`, `tw-corporate-action-v3.0`, `append_price_observation_v3`, caller-adjusted raw-price composite, acceptance `1.29.0`, or source-dataset v3.2 edge.

## Global consistency result

The complete active requirements/design/contract corpus was reviewed across authority selection, schemas, RPC types, routes, failure precedence, RLS/grants, manifests, job graph, projections, evaluation and the source-led boundary.

- Corporate-action authority is constructible end-to-end.
- Source and seven-authority enumeration is finite before filtering and concurrency-safe.
- Route, nonce, rollback and per-function audit effects align.
- Provider/price allowlists and canonical hashes reproduce independently.
- Manifest storage, deterministic successor creation and bounded worker call plans align.
- The 31-function grants, `ENABLE RLS`/`NO FORCE RLS`, sole binding policy and registry non-grants align.
- Full-market data remains restricted to bounded context/reference/mover-audit work and cannot create actionable or formal candidates.
- No additional P0, P1 or P2 issue was found.

The sole blocking inconsistency is the two-edge runtime version drift.

## Formal result

**Requirements Gate Round 31: `CHANGES_REQUIRED` — P0=0, P1=1, P2=0.**

Architecture Gate may not run. Implementation remains unauthorized.

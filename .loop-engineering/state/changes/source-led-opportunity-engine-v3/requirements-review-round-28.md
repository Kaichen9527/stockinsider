# Requirements Gate Round 28

## Verdict

CHANGES_REQUIRED

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 6 |
| P2 | 0 |

PASS requires P0=0 and P1=0. This review found six unresolved P1 requirements defects. No Architecture Gate was performed.

## Frozen evidence

- Repository: `/Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3`
- Branch: `codex/source-led-opportunity-engine-v3`
- Immutable baseline: `12c131aa50ca53268878e9f025973533ac100c49`
  - Tree: `c90ff9b693a6c8e0acb3d23b7068a231347e318c`
- Reviewed HEAD: `c679820dbc8012ffaf23b98b3171ae78192d39be`
  - Tree: `7c888f05f87e22d1ba5c8e01831e0b3a68b6f7d7`
- Exact reviewed range: `12c131aa50ca53268878e9f025973533ac100c49..c679820dbc8012ffaf23b98b3171ae78192d39be`
- Merge base equals the immutable baseline.
- Range shape: 30 commits, zero merge commits.
- Diff: 69 files, 5,541 insertions.
- Scope: 68 change-state files plus `.specify/memory/constitution.md`; zero App, web, Supabase migration, or other implementation-code paths.
- Complete state corpus read from the reviewed Git objects: 68 files, 829,851 bytes, 5,508 lines, with no blob-size/read mismatch. This included all 27 prior Requirements reports and both Architecture reports, used as history only.
- Governance inspected: `AGENTS.loop-engineering.md`, `docs/engineering/LOOP_ENGINEERING.md`, `.loop-engineering/policy.yaml`, `.loop-engineering/profile.json`, the constitution, and every file under the change state directory.
- Review was static and read-only. No implementation, migration, build, lint, test, network, repository write, merge, push, or deployment was performed.

## P1 findings

### P1-1 — Run identities omit two identity-bearing normative inputs

The three run-key preimages are declared exhaustive, but the exact 34-member static tuple omits `acceptanceVersion`, while both preparation and logical preimages omit `evaluationDatasetLockHash`.

Evidence:

- The static tuple and three exhaustive preimages are defined at [runtime-transaction-contract.md:112](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:112>), [runtime-transaction-contract.md:114](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:114>), [runtime-transaction-contract.md:164](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:164>) and [runtime-transaction-contract.md:180](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:180>).
- Begin reuses an existing success solely by `preparationKey` at [runtime-transaction-contract.md:205](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:205>).
- `evaluationDatasetLockHash` is a static approval hash and participates in canonical daily uniqueness at [shadow-evaluation-contract.md:14](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/shadow-evaluation-contract.md:14>) and [design.md:173](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/design.md:173>).
- Runs store the lock at [storage-schema-contract.md:137](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:137>).
- Public projections must contain literal acceptance version `1.27.0` and reject other values at [data-contract.md:248](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/data-contract.md:248>).

A changed dataset lock can therefore collide with and reuse a success carrying the previous lock. An acceptance-only version change can similarly make the old stored projection invalid while the unchanged preparation key prevents constructing a new success.

Required repair:

- Add the acceptance-inventory version to the exact static identity tuple.
- Add an exact, purpose-dependent `evaluationDatasetLockHashOrNull` member to preparation and logical preimages, with database-owned derivation and closed nullability.
- Preserve its deliberate separation from `comparisonContractKey` if intended.
- Add one-field mutation/golden cases for both identities and update all declared counts and mirrors.

### P1-2 — The provider-field authority cannot construct required trend and breadth evidence

The exact provider preimage admits one `taiex_trend` and one `otc_trend` scalar, but the market-reference contract requires six separate close/MA values. No normative mapping defines the trend scalar as a cutoff-bound close series or defines MA20/MA60 window and missing-session behavior.

Likewise, breadth requires at least 80% and 500 covered stocks, but the stored market observation carries only a percentage value. It has no covered count, eligible count, coverage manifest, or other evidence from which the required coverage decision can be verified.

Evidence:

- Provider rows are `taiex_trend` and `otc_trend` at [market-contract.md:21](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:21>).
- The stored enum has the same closed fact set at [postgres-type-contract.md:22](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/postgres-type-contract.md:22>).
- The required output instead contains `taiex_close`, `taiex_ma20`, `taiex_ma60`, `otc_close`, `otc_ma20`, and `otc_ma60` at [market-contract.md:60](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:60>), consumed by the formula at [market-contract.md:73](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:73>).
- Breadth coverage is mandatory at [market-contract.md:53](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:53>).
- The stored/input composite has no coverage fields at [postgres-type-contract.md:160](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/postgres-type-contract.md:160>) and [storage-schema-contract.md:83](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:83>).

Required repair:

- Define a complete fact-to-output derivation for close, MA20 and MA60, including exact session windows, cutoff filtering, correction/tie behavior and insufficient-history results.
- Persist or manifest-bind breadth numerator, denominator, official roster identity and coverage decision.
- If the provider rows change, recompute and freeze the new preimage length/digest and update acceptance.

### P1-3 — The global freshness selector is not bounded or indexed as specified

The contract asks for the three greatest distinct observation dates and requires correct duplicate-date collapse. The declared index orders raw `observed_at` rows and the prose applies `LIMIT 3`; three rows are not necessarily three distinct dates. An arbitrary number of corrections or duplicate-date rows may precede the third date, so the selector has neither a deterministic raw-row bound nor a matching date-level index.

Evidence:

- The distinct-date, 96-hour and three/four-date requirements are at [market-contract.md:51](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:51>).
- The only declared global index is `(provider,provider_identity,observed_at DESC,recorded_at)` at [storage-schema-contract.md:83](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:83>).
- `MKT-011` and `OPS-036` do not exercise the required three/four-date, duplicate-date-flood, or 96-hour equality boundaries; the nearest golden case is [acceptance-tests.json:214](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:214>).

Required repair:

- Define the exact relevant-market civil-date/timezone conversion.
- Supply a generated/expression date index or a constraint-backed per-provider/date authority.
- Bound duplicate corrections with an explicit raw-row `bound+1` rule before selection.
- Add executable cases for three versus four dates, same-date conflicts/floods, missing days, and exactly-before/at/after 96 hours.

### P1-4 — `LIMIT 20001` bounds label outputs, not the input scan

The Round 27 repair correctly makes the 20,001st eligible terminal identity fail before writes. It does not make finding those identities bounded.

The partial run index begins with random `run_id`, and joined score rows also begin with `run_id`. For a zero/sparse eligible result, the selector can scan arbitrarily many historical successful enrich runs and score snapshots before producing fewer than 20,001 identities. A literal result `LIMIT` does not bound rejected or non-maturing rows examined.

Evidence:

- The selector rule is at [shadow-evaluation-contract.md:26](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/shadow-evaluation-contract.md:26>).
- The exact indexes and no-unbounded-scan claim are at [storage-schema-contract.md:139](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:139>).
- `OPS-038` tests eligible result counts but not a large ineligible/sparse prefix at [acceptance-tests.json:217](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:217>).
- Explicit workload bounds are constitutional at [constitution.md:9](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.specify/memory/constitution.md:9>).

Required repair:

- Introduce a cutoff/maturity-leading indexed authority or bounded materialized maturity candidate relation.
- Specify an explicit raw-candidate `bound+1` sentinel before durable writes.
- Extend acceptance with zero/sparse eligibility behind an over-bound historical population, as well as the existing 20,000/20,001 output boundary.

### P1-5 — Partial evaluation remains normatively contradictory

The repaired evaluation contracts allow actual backtest counts `0..120`, but the design still delegates an exact `252/120/0..20` roster. Because the live side explicitly uses a range while the backtest side says `120`, this reintroduces the Round 27 exact-120 conflict.

Evidence:

- Conflicting statement: [design.md:201](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/design.md:201>).
- Correct partial behavior: [design.md:208](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/design.md:208>), [shadow-evaluation-contract.md:22](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/shadow-evaluation-contract.md:22>) and [manifest-storage-contract.md:30](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/manifest-storage-contract.md:30>).
- Acceptance expects partial completion at [acceptance-tests.json:213](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:213>).

Required repair: replace `252/120/0..20` with the exact `252/0..120/0..20` formulation while retaining promotion eligibility only at exactly `120/20`.

### P1-6 — The normative contract-version graph is inconsistent

Current normative requirements and acceptance still name superseded contract versions:

- Calendar requirement says v3.2 at [requirements.md:104](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/requirements.md:104>), while the current contract is v3.3 at [trading-calendar-contract.md:3](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/trading-calendar-contract.md:3>).
- Control requirement says v3.2 at [requirements.md:208](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/requirements.md:208>), while the current contract is v3.3 at [control-plane-contract.md:3](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/control-plane-contract.md:3>).
- Runtime/job requirements say v3.5/v3.3 at [requirements.md:211](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/requirements.md:211>), while current contracts are v3.6/v3.4 at [runtime-transaction-contract.md:3](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:3>) and [job-graph-contract.md:3](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/job-graph-contract.md:3>).
- The schema view still delegates to calendar v3.2 at [storage-schema-contract.md:87](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:87>).
- `OUT-005` expects outcome propagation through “v3.2 manifests” at [acceptance-tests.json:198](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:198>), while outcome/evaluation manifests are `source-led-eval-v3.3`.

Required repair: update every active normative reference to the deployed version tuple, make `OUT-005` name the exact manifest version, and re-version/remirror the acceptance inventory if its canonical five-field content changes.

## Round 27 re-audit

| Round 27 item | Round 28 result |
|---|---|
| Database `principal_role_unavailable` vs public authentication mapping | Closed. Database binding rejection remains distinct and maps to the fixed public authentication envelope at [auth-principal-contract.md:78](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:78>) and [auth-principal-contract.md:152](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/auth-principal-contract.md:152>). |
| Partial evaluation versus exact 120/20 promotion | Not closed: P1-5. |
| Byte-exact comparison/preparation/logical keys | Not closed: byte form is exact, but the exact schemas omit identity-bearing inputs; P1-1. |
| Exact same-purpose enrich lineage | Closed at [runtime-transaction-contract.md:201](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:201>) and [storage-schema-contract.md:137](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:137>). |
| Constraint-backed indexes versus three supporting calendar indexes | Closed at [trading-calendar-contract.md:22](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/trading-calendar-contract.md:22>) and [storage-schema-contract.md:79](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/storage-schema-contract.md:79>). Version references remain blocked separately by P1-6. |
| Label `LIMIT 20001` zero-write bound | Partially repaired but not closed: the 20,001st eligible output is zero-write; the raw scan remains unbounded under P1-4. |

## Market-context-v3.3 audit

Confirmed:

- Mechanical extraction produced exactly 18 provider-field rows.
- RFC 8785 preimage length is exactly 1,645 UTF-8 bytes.
- SHA-256 is exactly `a49a1f097ac9b87cb70da5d8f5d172ea39e2725134fc10b7a694a370b045f172`, matching [market-contract.md:43](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:43>).
- Exact `provider_identity` validation and nullability are specified at [market-contract.md:45](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:45>) and stored/input at [postgres-type-contract.md:160](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/postgres-type-contract.md:160>).
- TWSE/TPEX raw scopes, weighted breadth composition and summed flow composition are deterministic at [market-contract.md:47](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/market-contract.md:47>).
- `market-context-v3.3` and `providerFieldAllowlistHash` appear in the exact run static tuple at [runtime-transaction-contract.md:132](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:132>) and [runtime-transaction-contract.md:136](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-transaction-contract.md:136>).

Not confirmed:

- Constructible trend and breadth coverage authority: P1-2.
- Bounded global freshness selector/index: P1-3.
- Total run/version propagation: P1-1 and P1-6.

## Acceptance inventory audit

Mechanical audit result:

| Check | Result |
|---|---:|
| Version | `1.27.0` |
| Declared JSON cases | 213 |
| Actual JSON cases | 213 |
| Unique JSON IDs | 213 |
| Markdown rows | 213 |
| Unique Markdown IDs | 213 |
| Ordered five-field matches | 213/213 |
| Missing cases | 0 |
| Extra cases | 0 |
| Duplicate IDs | 0 |
| Field/order mismatches | 0 |

The declaration is at [acceptance-tests.json:3](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json:3>) and the Markdown mirror declaration at [acceptance-tests.md:3](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.md:3>).

The inventory is structurally exact, but structural mirroring does not resolve the six semantic P1 findings.

## Gate consequence

Requirements Gate Round 28 does not pass. Architecture remains locked, as already required by [status.json:35](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/status.json:35>) and [tasks.md:64](</Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3/.loop-engineering/state/changes/source-led-opportunity-engine-v3/tasks.md:64>).

All six P1 findings require normative repair followed by a new independent Requirements Gate over a newly frozen HEAD. This verdict provides no authority for Architecture review, implementation, migration, merge, push, deployment, or production mutation.

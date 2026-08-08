# Loop Engineering Requirements Gate — Round 26

## Verdict

**CHANGES_REQUIRED**

- P0: **0**
- P1: **4**
- P2: **0**
- Architecture Gate performed: **No**

## Frozen evidence

- Repository: `/Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3`
- Branch: `codex/source-led-opportunity-engine-v3`
- Reviewer session: `019f7895-3e53-7183-867c-23328e3812b8`
- Reviewer/model: fresh independent Requirements Gate, `gpt-5.6-sol`
- Reasoning effort: `xhigh`
- Baseline and merge base: `12c131aa50ca53268878e9f025973533ac100c49`
- Reviewed HEAD: `49832230eafb6f2aa6610416e87682da5db5e407`
- Reviewed range: `12c131aa50ca53268878e9f025973533ac100c49...49832230eafb6f2aa6610416e87682da5db5e407`
- Range size: 67 changed files and 5,176 committed insertions.
- Reviewer usage: 4,219,690 input tokens, 29,785 output tokens and 16,149 reasoning-output tokens.
- The reviewer read all governing Loop artifacts and all changed files. Prior reviews were history only.
- Review was static and read-only. It performed no test, build, lint, migration, network call, implementation, commit, push or deployment and changed no reviewed artifact.
- A repository-wide status probe encountered filesystem read timeouts on unrelated root files. The reviewer did not use that probe as write evidence; scoped status and diff for the reviewed artifacts were empty.

PASS requires `P0=0` and `P1=0`; this round therefore blocks Architecture Gate.

## Findings

### P1 — The exact begin signature cannot be called under the closed control-route plan

`begin_opportunity_run_v3` requires a caller-supplied `preparation_key`, while the key preimage includes ordered upstream/input run IDs selected only inside begin. POST exposes only `mode,sourceCutoff` and permits exactly one begin call; cron permits only one calendar read plus begin. The route can neither know the selected IDs nor calculate the required key without an untabled database read. In the same internal precedence, step 5 rejects zero upstream rows unconditionally even though `source_scan` intentionally has no upstream run.

Affected authorities: `runtime-transaction-contract.md:36`, `runtime-transaction-contract.md:115`, `runtime-transaction-contract.md:119`, `control-plane-contract.md:22`, `control-plane-contract.md:77`, `control-plane-contract.md:78`, `design.md:203`, `design.md:205`.

Required repair: make begin the sole owner of upstream selection and preparation-key derivation, or define another exact callable one-RPC interface without introducing a route-selected authority. Give each mode an exact upstream cardinality branch and preserve call counts, locking, idempotency and zero-write failures.

### P1 — Conflicting principal bindings have incompatible failure identities

`storage-schema-contract.md` names a differing greatest-recorded binding tie `principal_binding_integrity_failure`; `auth-principal-contract.md` maps conflicting eligible bindings to `principal_role_unavailable`. Begin's exhaustive catalog and control mapping contain only `PT403/principal_role_unavailable`. No authority says whether the database raises, translates or suppresses the storage name.

Affected authorities: `storage-schema-contract.md:65`, `auth-principal-contract.md:23`, `runtime-transaction-contract.md:115`, `control-plane-contract.md:73`.

Required repair: choose one exact SQLSTATE/message for binding conflicts, propagate it through every caller-bound RPC and HTTP mapping, and exercise the collision in the begin precedence oracle.

### P1 — Trading-calendar index shape is internally inconsistent

`trading-calendar-contract.md` requires `(status,close_at DESC,recorded_at)`, while the exact storage DDL requires `(market,close_at DESC,recorded_at,session_authority_id)` and omits the status-leading index. The contracts do not state whether one replaces the other or both exist, leaving the 1,025-row bounded selector and migration catalog implementation-selected.

Affected authorities: `trading-calendar-contract.md:22`, `storage-schema-contract.md:5`, `storage-schema-contract.md:79`.

Required repair: publish one identical exact index set in both authorities and bind it into migration/catalog acceptance.

### P1 — The executable task plan still specifies 201 V3 cases

The canonical inventory and Round 25 task state are `1.25.0` / 204 cases, but the active implementation verification task still says to run all 201 V3 cases. Following the task plan would omit the three new canonical cases.

Affected authorities: `tasks.md:59`, `tasks.md:84`, `acceptance-tests.json:3`, `acceptance-tests.md:3`.

Required repair: change the active task to all 204 cases and retain exact inventory/mirror/meta-test equality.

## Round 25 closure status

1. Begin/error/call-count blocker: **not closed**, because Findings 1 and 2 leave the one-call interface and exhaustive error catalog non-executable. The atomic rollback prose itself is present.
2. Cron cutoff/race blocker: at-own-cutoff, non-future view selection and begin hash revalidation are semantically specified, but exact DDL remains blocked by Finding 3.
3. Worker/resource blocker: **closed at requirements level**. One-revision parse, one bounded worker read, database-computed connector/outcome/evaluation projections, five-million-row indexed generic-manifest lookup and exact call ordinals are present.

## Static checks

- Version propagation is exact: control 3.1, calendar 3.1, graph 3.3, runtime 3.4, storage 3.5, PostgreSQL types 3.6 and acceptance 1.25.0.
- Canonical JSON declared/actual/unique count is `204/204/204`; every case has exactly `id,requirement,layer,setup,expected`.
- Markdown has 204 rows and 204 unique IDs with exact ordered five-field equality, zero missing and zero extra rows.
- The closed public RPC catalog has 31 entries and 31 unique identifiers.
- Only generic physical manifest tables are allowed; dedicated sector manifest tables remain forbidden.
- The committed range contains no app/runtime implementation or migration file.

## Gate consequence

Architecture Gate remains locked. Sol must repair all four P1 findings, persist the repair and submit the complete immutable range to another brand-new Requirements Gate. This review authorizes no implementation, migration, production binding, merge, push or deployment.

# Requirements Gate Round 48

Verdict: `CHANGES_REQUIRED`

Severity: `P0=2 P1=2 P2=1`

Architecture review was not performed. Architecture remains locked until a fresh Requirements Gate reaches `PASS` with `P0=0` and `P1=0`.

## RG-001 — P0 — Canonical acceptance evidence is not one-to-one semantic

At least 123 of 266 IDs still use shared ordinal, prefix, or static-presence checks:

- API: 19 shared wire-token checks.
- OPS/AUTH/CAL/MIG/SEC: 60 shared SQL-presence checks.
- MR3: 28 checks selecting arbitrary runner exports by ordinal.
- MOD/HYB-001..004: 10 shared cutoff/source checks.
- GOV/HYB-006..007: 6 structural-only entries.

The registry manufactures unique closures and evidence-reference strings, then treats their uniqueness as semantic coverage; it does not prove each ID’s stated expected behavior.

Required repair: supply a case-specific executable positive/negative oracle for every canonical ID. Function/evidence-reference uniqueness and static token presence cannot count as semantic coverage.

## RG-002 — P0 — Four-mode nonempty DAG/output construction is impossible

Current failures include:

- The worker expects deep-row members 6–10 to be objects, while the contract specifies status, valuation, action, and numeric percentages. Every contract-valid nonempty deep success therefore throws.
- The manifest read CASE ends without selectors for `peer_authority`, financial/scoring/valuation/market/mover references, or either link-audit kind, although those sections are declared in the section catalog.
- Enrichment scans all linked symbols and selects symbol order instead of retaining source-priority top 60 and applying the required 60/20/10/10 shallow ordering.
- Projection accepts only 20 candidate rows and derives its ledger solely from shallow results, losing deferred-before-shallow candidates.
- Required brief derivation rows are ignored; every workspace and detail brief is hard-coded empty/null.
- Link-audit headers hard-code all population/sample/resolution counts to zero.

Required repair: implement every native selector and exact tuple decoder, the bounded top-60/30/20 quota funnel, complete candidate conservation, nonempty brief derivation, and adversarial nonempty PostgreSQL lifecycle tests for all four modes.

## RG-003 — P1 — Provider/history/resource limits are not real pre-scan bounds

- The 128/192-byte request limit calls `request.text()` before measuring bytes, allowing an unbounded body read.
- Candidate enumeration performs unbounded distinct counts/scans before applying 5/30 limits.
- The financial contract requires pre-query 20-symbol rejection, database-enforced 4/12/20 history bounds, provider precedence, and `filing <= source <= collected <= recorded`. The table omits `collected_at <= recorded_at`, and the append RPC performs only a role check followed by insertion.

Required repair: use streaming/pre-read body rejection, indexed sentinel queries before aggregation, and a database-owned bounded financial selector with time, authority, conflict, history, and provider validation.

## RG-004 — P1 — Public/control/worker behavior is not exact

- Forbidden V3 paths must run the deployment gate before method handling. Public POST bypasses it and returns 405; detail POST bypasses it and returns the ordinary detail 404.
- Public names accept 80 characters instead of 40, detail paths 160 instead of 80, and all market groups accept 32 inputs instead of trend 6/others 3.

Required repair: gate every exact V3 method first and enforce every closed enum, string, count, and group-specific bound exactly in public/detail validators.

## RG-005 — P2 — Active Loop state is stale

The active state still records Requirements Round 44, Verification `not_started`, and an obsolete 22-RPC/17-relation blocker.

Required repair: synchronize the current gate round, findings, and truthful verification-track states without rewriting historical reviews.

## Prior-finding closure

| Prior finding | Status |
|---|---|
| R46-001 semantic acceptance | Open; executor coverage improved, but at least 123 IDs remain non-semantic |
| R46-002 migration/DAG | Open; nonempty runtime remains nonconstructible |
| R46-003 public historical selector | Closed; selection now uses one RPC |
| R46-004 control/worker wire | Partial; method catalog improved, but deployment precedence, bounds, and output semantics remain open |
| R46-005 runner cleanup durability | Closed by durable `recovery_required/IO_ERROR/11` handling and injected replay coverage |
| R46-006 third verification track | Partial; three scripts/jobs exist and aggregate cannot false-pass, but complete semantic no-skip evidence remains blocked by RG-001 |
| R46-007 stale Loop state | Open |

## Verified non-findings

- Host pin is exact: installed path, version, SHA-256, and size match `codex-cli 0.146.0-alpha.3.1`.
- Elapsed evidence is honest: the gate returned `blocked / non_fabricated_elapsed_cohorts_unavailable` with 120 backtest dates, 20 live dates, and 252 roster dates required; it cannot pass without database attestation.
- The Requirements reviewer made no file, database, deployment, or cohort-evidence mutation.

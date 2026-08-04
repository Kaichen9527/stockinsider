# Requirements Gate Review Round 46

Verdict: `CHANGES_REQUIRED`

Severity count: `P0=2 P1=4 P2=1`

Reviewer: fresh read-only Sol xhigh session `019f953d-8077-7fa2-a4fc-055fa9a99a66`

Review target: dirty implementation worktree on branch `codex/source-led-opportunity-engine-v3`

Architecture status: locked.

## Findings

### R46-001 — P0 — Acceptance evidence is not one-to-one semantic execution

Of 240 cases classified `semantic_automated`, 80 have no executor and validate only an evidence-kind string. The remaining 160 wrap seven shared broad-prefix oracles, and closure identity is incorrectly counted as distinct semantic evidence. `GOV-004` checks selected versions and hashes rather than the complete active graph. All 20 evaluation-governance cases are labelled `elapsed_data_blocked`, including executable unit/golden-fixture portions.

Required repair: give every canonical ID a concrete semantic oracle; execute every fixture/algorithmic portion; block only evidence that genuinely requires non-fabricated elapsed cohorts; implement a complete `GOV-004` active-graph parser.

### R46-002 — P0 — Migration is an empty-path scaffold rather than the active runtime contract

Manifest headers are partial, page and most worker reads are empty or hard-coded, logical identity uses the wrong preimage, typed validation and bounds are incomplete, normalized completion exists only for source parse and connector summary, mover audits are zero-filled, and recovery/lease/orphan semantics are incomplete. The migration test primarily proves an empty header/root path.

Required repair: implement every per-mode manifest/page DAG, exact identity, typed read/output, normalized writes, immutable lineage, mover audit, convergence and interrupted/non-empty lifecycle, with adversarial non-empty PostgreSQL tests.

### R46-003 — P1 — Public historical selection is incomplete

The application fetches and limits attempts before applying all predicates, performs more than one database statement, and cannot derive cutoff-visible warning facts for selected active or failed attempts.

Required repair: one bounded database selector implementing the complete historical precedence, convergence, tie and warning-authority rules without arbitrary prefilter truncation.

### R46-004 — P1 — Control and worker wire contracts are incomplete

Wrong-method handling and exact `Allow` coverage are incomplete, no-body framing is not total, SQL error mapping is partial, worker computation failures do not use the fail RPC, and some credential failures collapse to HTTP 500.

Required repair: implement the complete method/query/body/auth/error/call-count matrix plus deterministic failure/retry/terminal lease handling.

### R46-005 — P1 — Pre-prepared model-runner cleanup failure is not durable

Failure while recovering a prior resource reservation can occur before reservation assignment, leaving no durable failed resource record or task `recovery_required` state.

Required repair: durably terminalize the resource attempt and task as `recovery_required/IO_ERROR/11`, preserve exact replay evidence, and add failure-injection coverage.

### R46-006 — P1 — Mandatory evaluation-governance verification track is absent

CI and the aggregate verification script run product/runtime and model-runner only, so the aggregate can report success without a truthful third-track result.

Required repair: add the third track and make aggregate PASS impossible while any track is blocked or failed.

### R46-007 — P2 — Active Loop state is stale

The state still records Requirements Round 44 and obsolete missing-catalog blockers.

Required repair: synchronize current state and evidence after technical repairs and fresh gates without rewriting historical reviews.

## Prior-finding closure

Closed before this review: recursive public/detail schemas; Linux product versus pinned macOS runner isolation; generic migration production boundary; production-boundary documentation; host pin `codex-cli 0.146.0-alpha.3.1`; canonical host fixture size/hash; and the 884-byte runner identity.

Open: semantic acceptance, truthful elapsed classification, complete `GOV-004`, exact migration/DAG/identities, public selection, control/worker recovery, three-track CI, and pre-prepared runner cleanup.

No production write, deployment, or fabricated cohort row was performed. The reported 295/295 product tests are non-dispositive until R46-001 is repaired. The review sandbox could not create a temporary PostgreSQL cluster; a writable local PostgreSQL run separately passed the existing 9/9 migration tests, but those tests remain insufficient under R46-002.

`REQ-GATE-20260725-DIRTY-R46-CHANGES_REQUIRED`

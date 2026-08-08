# Requirements Gate — Round 17

- Reviewer: fresh independent Sol Requirements Gate reviewer
- Model: `gpt-5.6-sol`
- Effort: `xhigh`
- Session ID: `019f775b-3bb6-7870-b2cd-bc95466626dd`
- Date: 2026-07-19 (Asia/Taipei)
- Reviewed range: `12c131aa50ca53268878e9f025973533ac100c49..03f3373241dc132c0e048834613cbdf6d85f5992`
- Architecture Gate performed: no
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=4 P2=0`

## Findings

1. **P1 — Financial manifest rows require an authority timestamp that cannot be persisted or derived.**

   The sector-valuation and candidate-financial native rows require `sourceTimestamp`, distinct from `filingPublishedAt`, `collectedAt`, and `recordedAt` (`financial-data-contract.md:13`, `financial-data-contract.md:15`). But `opportunity_financial_facts_v3` has no `source_timestamp` column (`storage-schema-contract.md:84`), and `financial_fact_input_v3` cannot supply one (`auth-principal-contract.md:91`).

   An implementation must therefore invent whether `sourceTimestamp` means filing publication, provider source time, collection time, or a derived aggregate timestamp. This breaks knowledge-time authority and independently reproducible universal roots.

   **Required repair:** Add an exact `source_timestamp` column/RPC field with cutoff and ordering rules, or explicitly define it as byte-equal to an existing timestamp and remove the redundant field everywhere. Strengthen `FIN-002`, `FIN-003`, `OPS-019`, and `MIG-002` to vary and assert the complete timestamp mapping.

2. **P1 — The claimed exact PostgreSQL RPC catalog still contains non-executable type and behavior placeholders.**

   The contracts claim exact PostgreSQL argument and return types (`auth-principal-contract.md:48`) and an exact non-overloaded catalog (`storage-schema-contract.md:223`). However:

   - Composite members still use unnamed generic `enum` placeholders (`auth-principal-contract.md:77`).
   - Orchestration signatures likewise use unnamed `enum` arguments and incompletely typed record returns (`runtime-transaction-contract.md:31`).
   - `outputKind` has no closed type/value catalog (`runtime-transaction-contract.md:49`).
   - `counts jsonb` has no per-output exact schema (`runtime-transaction-contract.md:75`).
   - `reap_opportunity_jobs_v3` accepts caller-provided `now` (`runtime-transaction-contract.md:81`), while the normative behavior says reaping uses database time (`runtime-transaction-contract.md:108`).

   **Required repair:** Name every PostgreSQL enum/domain/composite and every return-column type; close `outputKind` and the per-kind count payloads; remove the `now` argument or define its exact validation/non-authoritative behavior. Update `MIG-002`, `OPS-015`, and `OPS-020` with catalog and adversarial argument oracles.

3. **P1 — Append-only authority families have no usable revocation/correction state transition.**

   Authority rows are immutable (`storage-schema-contract.md:11`), and corrections append rather than update (`auth-principal-contract.md:94`). But several manifests filter to `status=active` before conflict/collapse:

   - Discovery authority does so while also promising append-only corrections (`source-matrix.md:21`, `source-matrix.md:23`).
   - Publisher authority behaves the same way (`source-matrix.md:43`).
   - Peer reviewer and relationship authority filter inactive rows before selection (`requirements.md:88`, `requirements.md:90`).

   Therefore an open-ended active row cannot be revoked: an appended inactive row is excluded, while the old active row remains eligible. An appended changed active row instead conflicts or coexists. Instrument, alias, and taxonomy corrections have the same missing supersession seam.

   **Required repair:** Define one exact point-in-time supersession algorithm for every mutable authority family—identity key, latest-recorded selection including inactive rows, tie/conflict rules, then status/validity evaluation—or add an immutable supersedes event model with equivalent semantics. Add C−1/C/C+1 revocation fixtures for discovery, publisher, roster, alias, taxonomy, peer reviewer, and peer relationship authority.

4. **P1 — Round 16’s blinded-assignment success states are closed, but its failure oracle remains incomplete.**

   The eight success dispositions and their value-column nullability are now explicit (`auth-principal-contract.md:100`, `auth-principal-contract.md:104`). However, the ordered read failures do not assign an exact failure value to an invalid requested role, nor define an exact SQL/return/HTTP error representation (`auth-principal-contract.md:102`). Submission failures are only called a “typed conflict” without a closed conflict enum or precedence (`auth-principal-contract.md:106`).

   `OPS-022` exercises valid label-state combinations, but does not explicitly construct collisions among invalid requested role, missing/conflicting binding, unavailable sample, and cross-branch identity (`acceptance-tests.json:182`).

   **Required repair:** Define a closed failure enum and exact database/API representation for every read and submission failure, with complete precedence. Extend `OPS-021`/`OPS-022` with simultaneous-failure fixtures proving that precedence.

## Independently Confirmed Closed

- The Round 16 40/120 name blocker is closed: legal names retain 2–120 code points, short/public/alias names are bounded to 40, long legal-only names produce nullable public names, and nothing truncates.
- Discovery remains source-led and bounded; market-wide inputs are restricted to shallow context/reference and a non-promoting mover audit.
- Pre-truncation source revisions are immutable, family-collapsed, cutoff-bound, sentinel-limited, and resumably manifested.
- The universal manifest row/page/root/lifecycle protocol and the non-financial native row families are deterministic and bounded.
- Dual-control database-visible principal bindings, migration-owner-only mutation, arbitrary-UUID rejection, and non-FK actor history are present.
- Peer rows copy immutable stock IDs, store no symbols, and derive symbols only from the bound roster manifest.
- Assistive artifacts use only evaluation-header/run `comparisonContractKey` equality; dataset-lock and legacy-lock hashes cannot substitute.
- Transactional sealing, convergence, leases, staging isolation, atomic finalization, crash recovery, and resource envelopes are otherwise closed.
- Shadow-only authority, same-run V3 detail, no legacy refresh/write fallback, and no recommendation/strategy/alert/model influence remain explicit.

## Inventory Validation

- Version: `1.16.0`
- Declared/actual/unique: `179/179/179`
- Exact ordered five-field records: `179`
- Five nonempty string fields: `179`
- Duplicate, malformed, empty, extra-field, or non-string records: `0`
- Skip/todo registrations: `0`; only `GOV-001` textually prohibits them
- Version mirrors are consistent across `acceptance-tests.md`, `data-contract.md`, `v3-detail-contract.md`, `gate-summary.md`, tasks, and current cases.
- Semantic one-to-one closure fails because Findings 1–4 leave `FIN-002/003`, `OPS-015/019/020/021/022`, and `MIG-002` without complete executable oracles.

## Governance

`HEAD` was exactly `03f3373241dc132c0e048834613cbdf6d85f5992`, and the worktree was clean both before and after analysis. This was a Requirements Gate only; no Architecture Gate was performed.

The review was strictly read-only. No file was edited, staged, or committed; no application or repository code, migration, build, web access, deployment, or production operation was executed. Implementation and production mutation remain unauthorized, and Architecture Gate remains blocked pending repair and another fresh zero-finding Requirements Gate.

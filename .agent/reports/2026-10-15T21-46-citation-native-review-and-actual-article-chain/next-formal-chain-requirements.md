# Next actual article-chain integration — requirements, not approval

Evidence subjects: protocol/SQL base `0ea482ce1a1bdb28d1c7fe595e56f2c71ebda9ea`, consumer leaf `92870dc20828fd74f86f2681281a92bff2d9c2e3`, historical actual callers `15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb`. Current approved main is `93e44475cbb0c27beb26e4dcb68e382096a4e212`. These subjects are distinct. This document does not authorize a grant, installer change, new principal, registry activation, source approval, publication or production mutation.

## Proven remaining incompatibilities

- The historical route, author assignment, author packet and author result modules are absent from the new protocol base. The new controller and citation consumer have not replaced those actual callers.
- `20261009_research_author_assignments_v2.sql:44` calls the old v2 revision reader; line51 explicitly requires `research-article-input-v2`.
- `20261009_research_author_results_v2.sql:44,81` requires the original v2 result and validated-article schemas. A valid new citation set cannot bypass these guards.
- The reviewer context/result checks bind original author result, article hash, review-pack hash, independent principal, completion receipt and deadline. The reviewer-result migration retains closed v2 envelopes.
- Publication lineage and public-view schemas remain v2. A new article/role result cannot be published by changing a label or by storing a citation set.

The accompanying inventories give exact input SHA256 values and matching source lines. The scans establish these specific boundaries; they are not a complete architecture or security approval of the historical branch.

## Required application behavior

1. Provide a deliberate central version dispatch for the actual route, assignment, packet and result callers. Parse the original bounded request once, resolve only server-owned retained bindings, and preserve auth-first, exact principal identity, strict UTF-8/duplicate-key/byte limits and the original recovery actions. No client-selected root, schema, clock or trusted-validation boolean.
2. Retained old77/v2 sealed reads preserve their original request, row, hash and clocks without filesystem recalculation or extra charge. New fresh calls must have their actual new closure/executor binding. Unknown or unsupported old-fresh realms reject instead of relabeling the new build77b1. No fallback after a v3 failure.
3. The v3 article validator must actually consume the verified revision and new citation consumer, then validate the complete article. Preserve seven section ordering, reported/rumor/inference/scenario/gap distinctions, source admission/publication precision and rights, catalyst evidence, strongest counterevidence/falsifier, exact table references and uncalibrated valuation sensitivities with targetPrice null. Citation validation alone is insufficient.
4. Bind article and validated output to exact profile/wire/Hb/request hash/revision/input hash/calculation identity/article hash. Carry explicit units and period kinds through tables and the review packet. Cash facts cannot become assumptions, metadata cannot become facts, scenarios cannot become reported results. Old v2 article expectations remain unchanged.
5. The quarter-result citation slice does not cover all original article needs. Account explicitly for original income/monthly facts, supported scenario assumptions, next-four-unreported/full-year aggregates and every actual draft table/reference. Do not drop unsupported paragraphs, financial periods or tables to make a validator pass. Expose a real gap when a claim lacks typed support.
6. Preserve original author reservation, assignment and result ordering, reviewer independence and its separate reservation after author completion. Do not treat the existing chat content review, old drafts, manual PDF checks, source-only engineering receipts or synthetic native fixtures as these formal execution records.
7. Fresh source/rights/withdrawal, job/owner/attempt/reservation and deadline fences must be rechecked at actual assignment/result/publication transactions. A previously read local citation set has no permission to outlive revocation. No copied assignedAt, cutoff refresh, refunded reservation, extra role budget or second preparation ledger.

## Required database / publication behavior

Use an independently reviewed additive candidate migration with exact predecessor identity/owner/security/search-path/ACL/catalog guards. Preserve the existing v2 SQL files and supported replay behavior. Define finite version-aware result/reviewer/publication arms and exact payload keys; do not make existing validators accept arbitrary versions. Any proposed function/catalog/privilege delta needs explicit review; this requirements note permits none implicitly.

Reuse the original append-only ledgers, budget pools, source/global/parent lock order, writer and role authority. Keep original role/day/week/attempt/deep-job budgets, 4 slots/524288 tagged bytes, 120-second fresh preparation and existing material/HTTP limits. A fully stored new article must still require original authentic author/reviewer observations, lawful reservations, independent source/publisher qualification and atomic publication acceptance. No second service/outbox, raw SQL production write or new role/grant to make tests green.

## Evidence required before a release claim

- Exact actual-caller source range and complete transitive S/C/B/Q/R/A identities, with immutable retained old inputs and a genuine matching compiled Next executor. Engineering leaf/native Node hashes are not that closure.
- Actual authored article fixtures for both issuers exercising complete paragraphs/tables/periods, genuine independent semantic review scope and explicit remaining gaps. Fixture adaptation is not formal author execution.
- Real guarded HTTP plus isolated native PG/PostgREST coverage of the whole author→completion→independent reviewer→atomic publication path, not only direct storage or citation functions. Preserve all original RED and distinguish synthetic engineering principals from production-qualified ones.
- Negative proofs for mixed versions, changed article/table/reference/hash, wrong principal/reservation/deadline, revoked source, unknown profile, recovery/replay and same-budget race failures; no partial writes or refreshed clocks.
- Independent exact source/requirements/architecture review, genuine ordinary/protected checks, standard merge, verified package custody and fresh production capacity/peer/current-writer/lease gates. The approved DD binary and merged operator are separate immutable subjects; neither contains or approves this new article integration by implication.
- Actual formal publication receipts and read-only rendered desktop/mobile verification. Source completeness, technical observations, strategy and the formal research schedule require their own original acceptance; engineering PASS never substitutes for them.

The only active Cloud ownership is the new citation-native harness/proof. Do not implement or delegate overlapping changes while it runs. After its actual terminal result and independent receipt review, this matrix directs the next bounded application/SQL integration work; it does not redefine the full goal as a contract-test milestone.

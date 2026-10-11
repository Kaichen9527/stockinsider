# Complete research input — proposed implementation slice

This is a design for independent requirements/architecture review, not runtime authorization. Only spec.md, this plan and the scoped operation report are added by the design branch; existing shared tasks/code remain unchanged.

## Existing boundaries inspected

Paths/lines below are at ceafb7b919b545fa37c3d6f1372920c83bd08a95 unless stated otherwise.

| Existing location | Evidence and consequence |
| --- | --- |
| migrations/20261009_research_input_preparations_v2.sql:4,15,46 | Private immutable preparation table; prepare RPC is the existing write entry. New complete row must not retrofit payload/status/hash. |
| Same file:68–99 | Stable source then global deep lock, actual original job/reservation/attempt/priority lineage; replay rechecks source and lease. Reuse that order and semantics. |
| Same file:101–104,128–133 | Four-count/524288 quota currently queries ONLY preparation rows. New table requires additive replacement of that aggregate on the OLD entry as well. |
| Same file:122–127 | No calculator or financial material; status draft_incomplete and fixed no-dispatch flags. A closed successor schema is required. |
| migrations/20261009_research_publication_source_fence_v2.sql:42–83 | READ COMMITTED stable mutation fence, actual-write invalidation; do not replace with unlocked max(event_id). |
| Same file:88–130,138–150 | Source seal reconstructs exact rows/rights/current roots, rejects unsupported parent lineage; assertion does not itself grant publication authority. Financial files are not automatically covered. |
| migrations/20261008_research_observed_claim_v2.sql:11–32 | Existing observed company/member/optional-stock context and original role reservation; no need to create stocks UUID. |
| web/src/app/api/internal/research-deep-job/route.ts:11–41 | Exact bearer guards prepare action, old request parser and generic409. Extend explicitly; bounded new action parsing needed before request.json. |
| web/src/lib/internal-auth.ts:43–49 | requireExactInternalBearer is stricter than generic requireInternalAuth; no new auth mechanism/key. |
| web/src/lib/research-deep-author-input.ts:88–116 | Legacy bundle reader requires already-published stage. Do not route new input through this circular prerequisite; future typed union is separate publication integration. |
| scripts/research-input-preparation-postgres.test.mjs:16–30,55–105 | Existing disposable PG fixture, immutable/lease/replay/RLS/quota negatives can inform a new test. It is synthetic and not a full production chain proof. |
| a2046447: openspec/changes/research-first-publication-v2/financial-adapter-slice.md | Server finite AUO/EMC calculator supplement stays read-only; fact attribution/clock/hash and finite workload amendments are prerequisites. |

No `CREATE TABLE research_article_input_revisions_v2` exists in this base's tracked migrations. The name is proposed in first-publication-v2 requirements. Do not report it as an already installed schema. The design's added evidence namespace is the planned immutable input row, not a second source document store or publication flow.

## Bounded work and ownership proposal

1. After requirements/design pass and the financial adapter's exact code freeze, freeze complete nested JSON schema and JS/PG canonical vectors against actual adapter types. Reconcile only real interface differences; material changes return to review. Preserve read-only supplement output and historical model hashes.
2. Add `migrations/20261009_research_article_input_revisions_v2.sql` with table/closed RPCs/immutability/RLS plus additive replacement of old prepare quota query. Record exact expected predecessor body/owner in reviewed deployment preflight. Historical SQL remains byte-identical. No source trigger rewrite, generic lease modification or production role activation. Root separately owns release-plan/profile integration; implementation must not silently add an unapplied migration to a claimed deployed path.
3. Add `web/src/lib/research-complete-input-v2.ts` and `.test.ts`: closed bounded request parser, finite server mapping expectation validation, guarded replay read, actual reviewed calculation adapter call and remaining-time final admission. Change only the new action blocks in existing deep-job route and its focused route test. No existing author input parser schema change or automatic promotion. DB payload validation is not delegated solely to TypeScript.
4. Add `scripts/research-complete-input-postgres.test.mjs`: actual disposable PG17, two sessions/locks/races, privilege fixture, combined budget, atomic restart and immutable lineage tests. Reuse existing source/preparation fixture constructors or exact tracked migrations, not a parallel simplified implementation. A second full reviewed-chain run is required on the VM to catch real schema/owner/RLS differences.
5. Add one scoped guarded HTTP acceptance case to the existing VM research harness (path identified from its actual frozen implementation before editing), demonstrating supported original research job → unchanged preparation → persisted revision → exact reread through Next/PostgREST/PG. No model invocation, new authority or provider API. Anonymous/wrong shape and live source/lease failure included. Preserve non-authoritative labels on synthetic fixtures and no stock/stage creation.

Expected production code touch set is the new SQL, new library, existing guarded route; acceptance adds new tests and a narrowly identified VM harness integration. Shared package hook/release plan/financial adapter are separately owned by root/VM and must be coordinated after design pass. This design branch changes none of them.

## Ordering and failure controls

Source fence → global original deep/model slot → original row locks → immutable shared quota is the only admission order. File reads/calculation happen outside DB locks within the same10-second operation deadline; a final transaction repeats all mutable evidence and samples real server cutoff. Do not use BEGIN-time NOW as final admission. Initial read is not permission to write after expiry. RLS lock grants need actual owner policies, not superuser-only test success.

Read first on replay to avoid new knownAt or recalc drift. Only exactly identical expected source/calculator mapping and original request may recover a committed row; removed support/withdrawal/expiry rejects usable replay. No auto re-claim. Failed SQL transaction writes nothing, including no extra source seal. Post-commit HTTP loss is explicitly uncertain until exact read. Quota is immutable aggregate from both tables, serialized through the same lock on both old and new entrypoints.

Operational capacity remains separate from logical524288 cap. Before rollout measure heap/index/TOAST/WAL and report actual shared4GB evidence/host guard compatibility; this slice neither deletes evidence nor reserves physical capacity on behalf of uncoordinated writers. Prototype success in disposable PG does not authorize deployment.

## Acceptance handoff

Map CI-01..CI-09 from spec to named real tests; record exact source/tree, tools/migration list, command, TAP/named outcomes, HTTP identities with private content omitted, fixture privilege differences, cleanup and failed probes. No skipped required PG checks. Keep existing preparation/source-fence tests unchanged in expectation and rerun related financial adapter tests. Root queues actual PG/full-chain/HTTP/type/lint/production build on one VM job; Mac may run only finite parser/unit tests. A build has not run in this docs slice.

The final independent reviewer must check the complete diff, installed-schema preflight, original-source bytes, actual combined-cap race, admission timestamps, rights gap semantics and absence of capabilities. A later separate slice versions the existing dossier input union and role execution/publication receipt consumers to use this exact row. It must establish genuine configured independent author/reviewer authority and current source/financial review before dispatch/publication. This proposal removes durable input storage as a prerequisite gap; it does not claim that downstream work, model authority or first-publication acceptance is complete.

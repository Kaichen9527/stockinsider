# Immutable input preparation v2 — bounded VM increment

Window: 2026-10-09T04:32:20Z–05:02:20Z (manual engineering, not a model lease).
Branch: `codex/research-immutable-input-oct09`; base c6e5b753b775931f553ade05b7078cd4cc10115c.

## Implemented boundary

The existing exact-bearer `/api/internal/research-deep-job` accepts the closed `prepareResearchInput` action using the existing author-input request shape, observed scope only and bundleId:null. It calls one atomic `prepare_research_input_v2` RPC. Requesters cannot provide input hashes, execution clocks, author/reviewer identities, calculator paths, financial facts or verified flags.

The private NOLOGIN owner locks the stable source fence and original job/model slot, verifies the existing immutable priority store proof, independent research company/snapshot membership, original attempt/owner/reservation/lease and lack of model completion. Source row hashes and seals are rebuilt in DB. The RPC inserts one immutable private preparation; exact replay returns the old hash/admitted clock after rechecking original leases and source invalidation. No claim, reserve, budget refund, handoff or publication occurs. Same caller bytes cannot replace stored bytes. UPDATE/DELETE/TRUNCATE and direct BYPASSRLS service writes reject.

These are `research_input_preparations_v2`, a prerequisite to the approved full `research_article_input_revisions_v2` contract. They deliberately remain draft_incomplete: financial/calculator/originalModelCutoff are null; discoveryCutoff is the original priority cutoff, not a financial model cutoff. Publication precision stays as stored in the source seal (unknown publication remains null); no date is fabricated. Source selection is not claimed complete. The original server owner is a lease fence, NOT a verified model principal. dispatchReady/modelDispatched/publishableResearch/researchQualified/strategyApproved/entryEligible remain false. No stocks, instrument, stage, principal, recommendations or publication rows are created.

## Actual permission lessons

The first fresh PG run failed because PostgreSQL FOR SHARE requires a column UPDATE grant. The private NOLOGIN preparation owner receives UPDATE on the identity column solely for row locking; UPDATE RLS WITH CHECK(false) prevents actual changes, and the RPC exposes no mutation operation. Service-role privileges are unchanged. The actual Next/PostgREST profile then exposed an additional RLS requirement: the separate source-sealer owner needs an explicit SELECT policy on source_raw_documents. This new migration supplies that private-role policy; the reviewed 05aeb source-fence bytes are unchanged. Synthetic minimal PG now enables those tables' real RLS to catch both cases.

A separate transport retry failed before startup because the private artifact directory exceeded the Unix socket path bound. It was corrected by choosing a shorter private path; the guard was retained. Initial test/logs remain immutable evidence. No production migration was applied.

## Review attribution and pending work

Root relayed unsigned scoped code pass for exact05aebcb8e749a3cd32b5050de65331cf4424d452: reviewer actually ran isolated PG15/15 zero skip, ancestor/RR/SERIALIZABLE and conflict/no-op probes. Complete ancestor closure is unsupported and fails closed. This is a prerequisite review, not protected/production approval. Delivery c6e5b753 contains separately hashed clock770 and snapshotd274 receipts: snapshot actual17 PG/journal plus6 actual Next/PostgREST cases; clean d274 build/type/lint and resource provenance. It is a finite prototype with lifetime completed+active raw cap, not unlimited daily operation.

This increment's exact code still requires independent review. Full financial observation manifests, trusted static calculator binding, publication revision union, bundle/outbox/review/submission atomic transaction, real author/reviewer assignments and dispatch adapter remain unimplemented. Runtime status reports no configured identity/dispatch capabilities. Manual drafts/unsigned reviews cannot supply those identities retroactively; original leases/global budget remain unchanged. No model is called by this action. Input preparation receipt does not qualify or publish an article.

Focused PG/route, actual native profile, types/lint/build results and resource/hash provenance are sealed in the accompanying private sanitized JSON receipt after final verification. Old failures are distinct from final results. Root owns PR creation and independent review; no merge or deploy.

## Sealed maker checkpoint

Code subject a4f08b3afc82304ac65b926df84c393b20b88555 is pushed. Final focused46/46 and actual native32/32 have zero fail/skip. Native includes three new preparation subtests and all existing observed cases; do not add these counts as distinct product-role executions. Typecheck passed; lint33 warnings/0errors; normal clean build passed from a4 with web tree2482e96b535269746143b2085854defec5706c1d and BUILD_ID btP98u4RIUPCppYuc1TEC. The clean actual Next/PostgREST/PG rerun passed32/32 after that build. Peak sampled aggregate RSS: clean build1,224,364,032bytes, native811,380,736bytes. Host-visible available disk after native19,301,294,080bytes; this is not a project quota guarantee. cgroup memory.max32GiB/cpu.max400000/100000. Existing Node22.14.0/PG17.11/PostgREST16.3 reused, no dependency installation.

Sanitized receipt: `.agent/reports/2026-10-09T04-51-input-preparation-vm.json`,27620bytes,SHA256805b34c3a10351fee2903ad3e7a0eb3f323b49289197ed41f2e1e798bb7007a6. It binds six code/test hashes, exact clean build, original red/setup failures, final actual results, artifact hashes and100ms process-group/descendant RSS measurement limitations. No dotenv files were present in web's filename-only inventory; values were never read. Ephemeral development credentials remain private in stopped disposable test profiles and are not exported. Full v2 revision/role/publication acceptance remains pending.

## Additional full-suite result — retain red

At docs head443c251b, actual `npm run test:research-agents` ran500 TAP:478pass/22fail/0skip. It did NOT pass. One release-owner bridge test cannot resolve root dependency pg; two native files collide because the wrapper supplies one shared create-only artifact directory;19 pre-existing priority route contract cases reject the observed-priority dependency in their fixture loader. No assertion, guard or module pin was changed to suppress these failures. See `.agent/reports/2026-10-09T04-54-input-preparation-integration-supplement.json`. These need dependency/harness integration follow-up, separate from the final focused46 and exact clean HTTP32 already sealed. Source/test hashes of a4 remain unchanged; no complete integration claim is made.

## Independent growth finding / approved bounded repair design

Root reports actual isolated PG: eight public sources and129 legitimate subsets grew the original unit from1 to130 rows in3.4seconds with one reservation. Original9/9 and later46/32 green receipts remain valid for their narrower scopes, not final release approval. Probe SHA03ba58d0424be2becaf7fc61891e1576d3d7df09d3bbe8bc8b54431dee3b6a6b. Independently reviewed repair design:4 preparations AND524288 logical canonical UTF-8 bytes of full request/payload/new seal per original unit, nonrefundable; exact replay remains first after live lineage/lease/fence checks; same transaction and existing source→global lock order. Source-wide seal traffic and physical WAL are not bounded by this repair.

## Cap successor maker verification

Exact code3ac619dd3f70fbed2aef7a4def444e634630633d: final50/50focused routes+realPG and32/32actual clean Next/PostgREST/PG, zero skip. Typecheck/lint(0errors,33warnings)/normalbuild passed. Original fifth-admission red(8pass/2failTAP) and first private-owner root-function permission failure(4pass/9fail) are preserved. Exact replay at4 slots succeeds; expired/withdrawn replay rejects; concurrent final-slot clients yield1admission; byte rejection leaves prep/seal/reservation/completion counts unchanged. The524288/+1 exact-byte check is serialization-level via the same private charge function, not a claimed end-to-end exact-sized positive packet.

Sanitized receipt `.agent/reports/2026-10-09T05-16-input-preparation-cap-vm.json` binds source/build/hash, original independent130-row red, clocks, native source provenance and sampled resource measurements. All schemas are fresh disposable fixtures; no production upgrade or role execution is inferred. Independent successor code review remains pending. Original full-suite22fail and original receipts remain unchanged.

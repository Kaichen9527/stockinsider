# Source withdrawal and exact-row ABA: source-only candidate

Base: `b3432984263ad59866af6fb077a45b802c087dbf`. This delivery adds one three-child native entry and one lazy private fixture connection factory. **All three children and parent are NOT_RUN.** Node syntax checks are not native tests. No application module was imported, PostgreSQL started, source withdrawn, or authority exercised during this task. Separate review and explicit heavy authorization are required.

## Fixed scope and barriers

| New child | Real lifecycle prefix | Independent mutation / barrier | Exact required rejection |
|---|---|---|---|
| AUO `v3-pre-post-withdraw` | Original lawful roster/source/claim/preparation, current v3 first-seal attempt | Actual preassert succeeds with zero opens; all9 FDs open and none closed; dedicated service-role client commits withdrawal before actual postassert RPC | `P0001 source_seal_invalidated_or_missing`; no revision, preparation count1; all9 FDs close |
| EMC `compat-post-seal-withdraw` | Same lawful lifecycle, compatible-v2 first-seal attempt | Actual postassert succeeds with all6 FDs held; all6 close; independent withdrawal COMMIT precedes actual seal RPC | Same exact error; no revision, preparation count1 |
| AUO `old77-exact-row-aba` | Original-v2 neutral preparation, exact15d4 original child/real old sealer first COMMIT | Independent COMMIT A→withdrawnB, then independent COMMIT B→originalA; different transaction IDs; full row JSON and PostgreSQL rowhash must equal originalA | Current read and seal replay each reject same exact error; zero current-realm FS; old sealed row, charge, request/input hashes and clocks unchanged |

First two are first-seal **attempts** interrupted at the requested boundary, not successful first seals. Third uses `produceHistorical77` directly as a necessary new-case prefix; no old native entry is imported or re-registered. Original child still verifies its actual8 FD lifecycle, original assertion/seal RPC order, exit+close and pending RPC settlement. This is actual Node historical source execution when later run, not historical compiled Next identity. New Hs/Hc bindings are never relabelled77b1.

## Source evidence and role boundary

`20261009_research_publication_source_fence_v2.sql` write/record triggers both take transaction lock610091002. Every real UPDATE records before/after PostgreSQL full-row hashes and adds an invalidation for each sealed root dependency. `assert_research_source_seal_v2(uuid)` checks missing/invalidation before checking current row hashes. Restoring identical data cannot delete an immutable invalidation. Original preparation replay calls that assertion. Candidate parent/assert/read/seal retain that original path, including earlier source/job/attempt/reservation/lease fences. These earlier fences are not stubbed; an unexpected earlier error must fail the new test rather than satisfy an OR of errors.

The captured source table has no `updated_at` column. Static captured DDL shows its production writer trigger and existing service-role table privileges; this is not proof that the later disposable runtime mutation will succeed. `enforce_production_writer_fence()` in the schema-only capture also has a no-active-release early return. The test still takes its own original `acquire_production_write_lease('production-data-plane', uuid, 3600)` lease, modifies only the selected synthetic row's `metadata.rights_boundary` via parameterized UPDATE under explicit READ COMMITTED, commits, then owner-bound releases. No session guard flags, headers, RESET ROLE, superuser write, role/grant/trigger changes, or formal release IDs are added. If the real guarded path refuses, preserve that exact failure; no permission fix is authorized here.

`createSourceMutator()` is lazy and private to this fixture. It reuses `connect()` and the existing `clients` finally set, sets service_role, verifies current_user, and changes no default-case connection count. Mutator PID must differ from writer and read-only observer. Its awaited COMMIT ordinal must precede the actual blocked RPC call. The observer checks committed returned rowhash. Read-only observer snapshots use independent statements while no concurrent mutation is in flight; they are not labelled one repeatable-read snapshot.

## Exact audit accounting

Every saved stage includes all9 count/full-row hashes, full preparations+revisions ledger and audit-only JSON SHA, original saved logical charge sum/count, full source rows, immutable events, invalidations, seals, owned lease-table state, and actual FD counters. Pre/post assertion-success snapshots and barrier snapshots retain actual RPC traces. Intentional source mutation is narrowly accounted: one selected rights field, one event whose before/after hashes match, and exactly the dependent-seal invalidation pairs. All other8 tables, full ledger/charges, seals, leases and other source rows must match. Failed RPCs must add no changes, including no extra event/invalidation. ABA checks the complete restored row and source-table hash, not just its rights flag. Unexpected other-column change creates `aba-row-restoration-pending.json` and fails; it is not silently repaired. Original false capability flags remain false.

Raw snapshots, principals, source URLs/payloads, RPC traces and server logs are private local files only. Future public evidence must contain sanitized hashes/counts/charge/FD/order/cleanup only. Existing helper preserves each company+case server log before/after cleanup and owns the new client's close. Confirming actual daemon/backend absence, close settlement and cleanup in the execution receipt remains pending; no source-only output claims cleanup ran.

## Future command — NOT EXECUTED

After separate authorization, provision no new dependencies; use the already verified Node22.14/PG17.11 PATH, OS-derived USER, unchanged proxy/CA, and a fresh absent short absolute artifact leaf:

```sh
RESEARCH_PREREQUISITE_PROFILE_ARTIFACTS=/tmp/source-withdrawal-exec-UNIQUE \
node --import ./scripts/opportunity-v3/research-versioned-prerequisite-fs-witness.mjs \
  --experimental-strip-types --test --test-concurrency=1 \
  scripts/opportunity-v3/research-versioned-source-withdrawal-native.test.mjs
```

Only this entry, three children+parent, failfast. Do not select prior green6 cross-wire, byte2, old77 two-child or financial28 suites. Captured schema + original50/26 + unchanged candidate36 + explicit LOCAL two-owner USAGE profile remains the sole setup. All source and global locks, 10s producer/session and30s child containment, 120s freshness, 4slot/524288, source<=30 and other budgets remain unchanged.

## Pending / provenance

All PostgreSQL execution, exact error propagation, current-source mutation permission, original writer-fence condition, per-barrier deadline feasibility, exact-row restoration, FD/error cleanup and backend absence are NOT_RUN. No native pass count, formal source/publication eligibility, independent review, protected approval, deployment, full four-caller/whole-closure or live safety claim follows from syntax success. Wider lease/ABA/quota/lockwait races remain outside these three cases.

Original old77 delivery `b3432984` / receipt `73f036773a40a1d3918d7ca6725c294e1f92bea58480ce01309e5c38866e6d05` remains unchanged (3PASS historical scope, private68 raw not fetched by Root). Original lifecycle305 error-while-alive RED and c7d666 fix evidence9d68 remain historical. Original byte594 RED/c462 correction and rejected would-charge=null remain historical; no old green run was repeated or backfilled. Static lookup mistakes during this task (nonexistent guessed filename/glob) are tooling lookups only, not a product or PostgreSQL RED.

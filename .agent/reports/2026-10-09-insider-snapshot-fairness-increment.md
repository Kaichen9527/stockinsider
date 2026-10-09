# Insider snapshot fairness: inactive implementation increment

Base: d42f951906f43fb9d9eb885ae69c27659ee39751. The root's finite metadata clarification 962f7741f40f35b8770728c8d83b06ddf4f1d884 is cherry-picked as 6972cca. No production migration, official endpoint read, provider, credential retrieval, schedule activation, protected evidence or trade authority was performed.

## Implemented candidate

- Private immutable raw bytea snapshots; separate offset/generation/completion; five fixed datasets; original observation/attempt clocks; exact byte SHA256; full schema validation before admission. Globally serialized 128MiB/32-snapshot and 128-run/640-member capacity, no eviction. Existing run continues when new-run capacity fills.
- Durable acquisition run is created before fetch. Existing mapped/active snapshots are resolved first. All five pins freeze before page processing. Completed/empty members remain mapped; later calls do not reacquire them.
- PostgreSQL derives canonical row SHA256, exclusions and expected document projection. ASCII content is at most500bytes and fits the existing minimum500-character document bound; full original bytes stay private. Required semantic fields beyond512 UTF8bytes are explicitly unsupported and reject admission, never become false exclusions. Snapshot URLs include snapshot/index/DB-row-hash and preserve original dataset URL in metadata; old documents/URLs are untouched.
- Existing `upsertSourceRawDocuments` persists DB-derived documents. Commit independently verifies actual persisted platform/URL/title/summary/content/symbols/metadata, publication null, neutral stance, official-evidence semantics and canonical content hash before CAS. No document-writing RPC was added.
- Explicit guarded POST only: `{"connector":"twse_insider","insiderSnapshot":{"runId":"<UUID>","pins":[...]}}`; omit pins only when initially resolving the durable run. No symbol/dryRun/all/GET mode or extra body fields. Authentication and production write lease remain. Ordinary scheduled/default and symbol collectors remain unchanged pending reviewed rollout.
- Route ledger uses original oldest member observation for source cadence. Pure cached processing never adds a new source succeededAt; stale completed cache returns refresh-pending. Processing clocks and latest actual live acquisition clock are separate.
- Existing source controller exports bounded continuation. Only exact typed pages_remaining502 with matching five pins and valid monotonic persisted progress can continue. Up to100 sequential calls/30minutes; unknown/mixed502, uncertain write, changed pin or failed journal stops. No retry. Explicit loopback command uses a fresh private append-only journal directory and existing guarded HTTP endpoint; it is development-only and cannot point to arbitrary/production hosts.
- Legacy cursors remain untouched and are explicitly annotated `legacy_snapshot_unavailable` in new run metadata. They are not claimed migrated.

## Evidence completed locally

Original negative witness: old hash-based paging processes only rows0–499 for changing A/B/C1001-row responses (`/tmp/insider-snapshot-red.log`: witness pass plus expected missing-new-module failure). This is a baseline witness, not a claim that existing tests originally failed.

78 lightweight tests passed,0skipped (including4 actual loopback HTTP adapter checks, with synthetic responses rather than Next/PostgREST):

```
node --experimental-strip-types --test scripts/research-insider-snapshot.test.mjs scripts/research-insider-continuation.test.mjs scripts/research-insider-collector.test.mjs scripts/research-insider-health-route.test.mjs web/src/lib/research-insider-official.test.ts scripts/research-source-controller.test.mjs scripts/research-insider-guarded-http.test.mjs
```

TypeScript check passed after the repository's normal local official-authority build-input sync. Focused lint:0errors,22existing research-v2 unused warnings. No Mac production build or PostgreSQL server run. The separate Linux FD-anchored journal suite was syntax-checked only and is queued for VM. No selfapproval.

## VM queue and remaining acceptance

First actual PostgreSQL dependency-profile harness (no skips; missing tooling fails):

```
RESEARCH_LOCAL_DATAPLANE_PG_BIN=/path/to/pg/bin node --test scripts/research-insider-snapshot-postgres.test.mjs
node --test scripts/research-insider-journal-linux.test.mjs
```

It loads the new migration verbatim, with explicit minimal source-document dependency fixture. It checks RPC-only access, clocks/schema/hash/rights rejection, whole-response validation, five-member freeze, DB-derived exclusions, wrong document rejection, restart after documents, CAS replay, completed empties, shared active snapshot, immutability,128-run limit and non-destructive reapply. **It has not run yet and is not a full predecessor/ACL or guarded Next acceptance.**

Remaining owned work continues: real maximum12MiB/base64 PostgREST transport; raw/row/global/record exact/+1 and concurrent admissions; real guarded Next→PostgREST fixture acceptance with installed lease/ledger/raw-document dependencies; actual Linux journal tests and measured peak RAM/database/WAL growth. No enablement before these pass and independent exact-code review. VM must retain20GBresident/4GBtemp/8GBreserve envelope; available filesystem bytes alone are not a quota proof.

Root owns shared reviewed migration plan, release identity regeneration, normal production build/VM integration and subsequent default/schedule activation. This candidate intentionally does not modify the shared release plan and cannot claim daily full-market operation or indefinite128MiB retention. Policy identity `official-insider-private-research-retain-v1` denotes only the existing fixed official endpoints for private research evidence retention; no publication/trading entitlement or new procurement is implied.


Loopback continuation command (VM only; use the existing local INTERNAL_API_KEY in memory, never print it):

```
node scripts/research-insider-continuation-command.mjs --input /private/run-request.json --origin http://127.0.0.1:APP_PORT/ --journal /private/new-journal-directory
```

The input is `{ "runId": "<UUID>" }` for initial acquisition. A prior journal entry can be an explicit resume input; a new journal directory is required. Every entry is mode0600 beneath a mode0700 FD-anchored directory. The command cannot select a non-loopback URL. Completed members remain pinned by the database even if an initial request is used after an uncertain HTTP result. This is explicit operator resume, never an automatic retry.

## Independent-review repairs (successors of4b3)

- Capacity P2 remains **open**, with a proposed durable reservation amendment in `openspec/changes/insider-snapshot-fairness-v1/capacity-reservation-amendment.md`. Arithmetic/source-bound witnesses demonstrate the stranded partial set and why a transient free-space check is insufficient. They are not actual PostgreSQL evidence. No capacity behavior has been weakened or silently changed.
- CLI P2: reproduced a FIFO input waiting beyond700ms before `fstat` (`/tmp/insider-fifo-red.log`). Successor opens with `O_NONBLOCK|O_NOFOLLOW`, verifies a regular descriptor, reads at mostMAX+1bytes and rechecks identity/size/ctime. Three actual lightweight regressions pass, including controlled regular-file growth during read, exact/+1, symlink/directory and malformed UTF8.
- Projection P2:500 valid holding rows with512U+0001 bytes in each of person/company/role fit under12MiB raw, but their projected metadata alone exceeds4MiB. New admission guard calculates every DB-derived page's serialized JSON size plus16KiB fixed-envelope reserve. A provisional snapshot is transaction-private; rejection rolls it back before active progress/member binding. The4MiB/500row limits are unchanged. The arithmetic counterexample passes locally; the actual PostgreSQL regression is added but **not yet run**, so this is a candidate fix awaiting VM and independent verification.
- Targeted repair regression:23passed/0skipped. Neither the three findings nor full implementation acceptance is declared closed by the maker.

## Durable capacity implementation candidate

Root relayed unsigned independent requirements/design pass for a006d60bc63235d0959f73dbaa8f42af70017827 and authorized implementation. The amendment now explicitly excludes cancellation and requires consumed-token identity retention. No protected approval is claimed.

`begin_run` now atomically resolves or reserves all five dataset members before any fetch. A private token row records each pending12MiB/one-slot liability; concurrent runs share the token. Global admitted bytes/records plus all distinct pending reservations must remain≤128MiB/32. Admission requires its exact token and atomically exchanges reserved capacity for validated actual raw, resolves all subscribing members, and freezes only five-real-snapshot maps. Consumed token rows remain immutable identities linked to their original snapshots, uncharged as reservations. No token expiry/cancel/delete or partial-source failure cleanup was added. Permanent source failures remain visible bounded pending liabilities.

The migration is still an **unapplied candidate**. Reapplying it over a prior experimental schema without `acquisition_token` fails before the first mutation; a fresh disposable VM profile is required for current acceptance. It does not pretend to be an approved data migration from an earlier deployed snapshot schema.

New orchestrator contract red:2pass/4fail (`/tmp/insider-reservation-red.log`); green:6pass. Combined lightweight suite:84pass/0skip; TypeScript pass; changed module/route lint0errors0warnings. Actual PG/transport remains **not executed locally**. The PG harness now covers the112MiB stranding counterexample, exact/+1 actual+reserved128MiB and32slots, shared subscriptions, old consumed-token replay after a newer token exists, and refusal to bind an old token to the new run. Retained-capacity fixtures are explicitly synthetic disposable owner-installed rows; they are not official source acquisition or production authority.

All three independent findings still require reviewer/VM closure. The root reported a narrow unsigned pass of173b6b7 for CLI/projection static code only, with actual PG/PostgREST outstanding. Default activation, shared migration plan, capacity/transport measurements and production build remain open.

## Actual guarded stack harness prepared (not executed by maker)

`scripts/research-insider-dataplane.test.mjs` starts a separate real PostgreSQL/PostgREST16.3/normal built Next stack under the existing Node test-runner loopback configuration. It verifies the pinned PostgREST archive/binary, installs selected tracked dependency DDL verbatim with explicit service-role fixture ACL, and installs the new migration verbatim. It seeds only synthetic raw snapshots through the actual admission RPC; all five pins exist before guarded source-sync, so that fixture does not request official-host acquisition.

Planned executable checks: unauthorized401/no documents; actual existing document writer + DB CAS over three1001-row rounds; first collected_at and original five IDs preserved on replay; actual12MiB raw/16MiBbase64+envelope admission over PostgREST and +1 rejection; escaped-control500row admission rejection with no partial raw activation. It records database/relation/WAL bytes and **end-of-test** Node memory, not a peak-RAM guarantee. Separate VM process monitoring remains required for peak20GBresident/4GBtemporary/8GBreserve acceptance.

```
RESEARCH_LOCAL_DATAPLANE_PG_BIN=/path/to/pg/bin \
RESEARCH_LOCAL_DATAPLANE_POSTGREST_BIN=/path/to/pinned/postgrest \
RESEARCH_LOCAL_DATAPLANE_ARTIFACTS=/private/new-insider-acceptance-directory \
node --experimental-strip-types --test scripts/research-insider-dataplane.test.mjs
```

No missing-tool skip: Linux, built Next artifact and tool paths are mandatory. The artifact directory must be new. Test keys/JWT exist only for the disposable loopback fixture and are omitted/redacted from persisted reports. No inherited production keys, official roster, stock rows, model/approval authority or platform credentials are imported. This is a narrow source/lease/ledger dependency profile, not a full reviewed production schema or installed-policy attestation. Maker syntax-checked the harness only; successful transport/Next/PG execution is **not yet claimed**.

## Actual VM PostgreSQL RED and scoped name-resolution repair

Root reported actual c96 PostgreSQL execution: 7 passed / 9 failed, first admission token UPDATE rejected with `missing FROM-clause entry`. Linux private journal: 1 passed. The source used `admit_insider_snapshot_v1.snapshot_id` for a variable declared in an unlabeled inner block. That qualifier is not a relation or the variable's block label. The successor names the local value `v_snapshot_id` throughout admission, including both token/member UPDATE right-hand sides. Columns, immutable token semantics, locks and acceptance expectations are unchanged.

Local unchanged snapshot/capacity lightweight regression: 8 passed / 0 skipped. This does not execute PL/pgSQL. Actual VM PostgreSQL rerun is required to establish green; no maker claim that the nine failures are closed. The separate actual-stack harness has two independent-review findings (unconditional passed receipt and cancellation/cleanup bounds) and remains unapproved pending its own repair.

## Actual-stack harness receipt and lifecycle repair

The independent reviewer identified that awaited `t.test` does not throw when its child fails: the old unconditional `report.passed=true` could contradict red TAP. A controlled child-process witness reproduces that old false positive. The repaired harness records all five required named checks as pending/running/passed/failed. Positive receipt requires every check passed, no locked failure/cancellation/deadline, and confirmed cleanup. A failed/missing check or late success cannot authorize a positive receipt.

A test-only lifecycle now binds the180-second monotonic deadline and actual `t.signal` to readiness, all HTTP/RPC calls and the continuation command's POST adapter. Cancellation starts idempotent cleanup immediately. The outer190-second test bound includes the separate8-second cleanup budget. Next/PostgREST logs each retain at most1MiB; overflow cancels. Owned ChildProcess close events, HTTP server sockets/handlers, continuation work and disposable PostgreSQL shutdown must settle before positive receipt. TERM→KILL is sent only to still-live owned children; unconfirmed close fails the receipt. PostgreSQL commands have remaining-deadline timeouts/SIGKILL; cluster shutdown has its own bounded asynchronous pg_ctl. This adds no production runtime behavior or source-scheduling change.

Seven lightweight lifecycle probes pass: old false-positive witness; repaired failed-child receipt; real hanging HTTP abort + child close; external cancellation and late completion; incomplete/cleanup-timeout/log-overflow/success outcomes; actual node:test cancellation; owned child ignoring TERM requiring KILL. Combined existing input/continuation/guarded HTTP plus new lifecycle suite:24 passed/0 skipped. Actual-stack syntax check passed. Actual PostgreSQL and normal Next/PostgREST execution remain VM-only and are not claimed green by this repair.

# Legacy and OpenSpec Compatibility Contract: source-led-opportunity-engine-v3

Version: `legacy-compatibility-v3.2`

This checkpoint authorizes V3 research shadow only. `OpportunityEngineV3.mode` is exactly `shadow`; an `authoritative` value is invalid until a later approved Change Gate amends both this contract and the applicable OpenSpec baselines.

## Deployment state and fail-closed routing

`SOURCE_LED_OPPORTUNITY_V3` is the sole deployment-state variable and accepts exactly `disabled|drain|shadow`; absence is identical to `disabled`. `authoritative`, an empty string and every unknown/case-different value fail build/startup validation and, if observed at request time, are treated as `disabled`. The state is deployment configuration, never a request, database, cookie or client-selected value.

- `shadow` mounts the exact V3 route catalogs and additive public `opportunityEngineV3` projection owned by their domain contracts. It alone permits V3 begin/cron, ingestion and human-authority traffic. Production schedules still require their separately approved enablement checkpoint.
- `drain` permits only `GET /api/internal/opportunity-run/status/{runId}` and `POST /api/internal/opportunity-worker-v3`; no cron/begin, runner-ingestion, human-authority, public V3 or detail V3 route may execute. A trusted rollback operator may call the already-cataloged `reap_opportunity_jobs_v3` directly with the approved V3 service tuple and fixed runner principal; this creates no route or RPC. No new run, authority, source revision, label or projection can begin in drain.
- `disabled` permits no V3 internal, public or detail operation and emits no `opportunityEngineV3` member. Existing V3 database rows are ignored by application selection and cannot affect legacy behavior.

For an exact V3 path forbidden by the current state, the deployment gate runs before route-local validation/authentication/client acquisition and returns HTTP 404 with RFC-8785 bytes `{"code":"v3_disabled","error":"v3_request_rejected"}`, `Content-Type: application/json; charset=utf-8`, `Cache-Control: private, no-store`, zero Supabase/network call and zero write. An unmatched path keeps the framework's ordinary 404 and is not converted into a V3 response. In `drain`, the two permitted routes retain their complete original contracts. Public radar/detail selection checks this state before any V3 query; `disabled|drain` therefore omit the entire V3 object rather than serializing a cold V3 object.

V3.11 separately repairs the legacy product through
`legacy-radar-correctness-contract.md`. Its additive legacy research fields and
precomputed projection are independent of `SOURCE_LED_OPPORTUNITY_V3` and read no V3
table. For a fixed reviewed V3.11 projection fixture, changing only the V3 state among
`disabled|drain` leaves the complete legacy response byte-identical and the exact V3
404/zero-query behavior unchanged. Removing the additive V3.11 members must reproduce
the reviewed `legacy-baseline-lock-v3.11` fixture; the historical pre-V3.11 byte lock
is not an oracle that forbids this explicitly approved additive correctness repair.

V3 session-based freshness governs research-shadow calculations and labels. It does not relax the existing market-intelligence OpenSpec one-hour publication gate. Shadow V3:

- never inserts or updates `recommendations`, `strategy_actions` or `line_alert_events`;
- never itself changes legacy radar array membership/order or a legacy recommendation publish timestamp; the independently tracked legacy-correctness producer may publish only through its own reviewed projection contract;
- labels every action as research-only and `publicationEligible=false`;
- cannot trigger an execution/notification transition even when its research action is `starter_now` or `event_starter`.
- links a V3 card only to `/opportunity-v3/{runId}/{symbol}` and reads only that run's immutable V3 detail projection; it never enters `/stock/{symbol}` automatically, invokes legacy deep-dive/technical lookups, queues a legacy refresh, or fills a missing V3 field from legacy state.

Any future authoritative projection requires a separately approved contract that, at minimum, revalidates critical market/stock inputs at <=1 hour when publishing, maps V3 actions into `buy|watch|reduce`, upserts complete strategy fields, emits state-transition events, and defines conflict precedence with legacy. Until then, failure to keep V3 isolated is a P1 compatibility/security failure and mode remains shadow.

## Rollout and rollback DAG

The approved forward DAG is exact and may advance one edge at a time: `rollback_lock_captured -> schema_preflight -> additive_schema_committed -> application_disabled -> bindings_approved -> shadow_smoke_verified -> shadow_schedules_enabled`. `rollback_lock_captured` is a separately reviewed deployment artifact, not `legacy-baseline-lock.json`, with exact RFC-8785 object `{legacyCodeRef,fixtureDatasetHash,radarPayloadHash,recommendationsRowCount,recommendationsRowsHash,strategyActionsRowCount,strategyActionsRowsHash,lineAlertEventsRowCount,lineAlertEventsRowsHash,legacyRouteAuthProbeHash,legacyScheduleCatalogHash,capturedAt}` and its own SHA-256. The three fixture tables hash full row objects sorted by their declared primary key; the schedule hash is over ASCII-path-ordered `[path,blobSha256]` pairs for exactly `web/vercel.json` and `.github/workflows/night-shift.yml` at `legacyCodeRef`. Every hash is lowercase 64-hex, timestamp is UTC whole-second RFC-3339 and the fixture dataset is immutable. Null/missing evidence blocks the first edge. Schema preflight requires all extensions/roles/catalog assumptions, including the installed `pgcrypto` extension in schema `extensions`, exact `extensions.digest(bytea,text) RETURNS bytea` membership and all three DNS/job/page UUIDv5 golden vectors, before the first V3 DDL statement. The complete schema migration is one transaction: preflight/DDL failure leaves zero V3 object; a committed schema is additive and remains present through every later rollback. The application is first deployed in `disabled`; bindings/secrets are a separate approved checkpoint; smoke uses `shadow` with schedulers off; schedules are last. No edge authorizes `authoritative`.

Any failed catalog probe, V3 5xx/error-budget breach, integrity/hash/conservation failure, credential incident, unexpected legacy diff, scheduler duplication or operator decision triggers the rollback DAG:

1. Atomically disable every external V3 cron/launchd/GitHub dispatch, then change deployment state `shadow -> drain`. Record both configuration revisions. From this point all new begin/ingestion/human/public V3 operations are the common 404/zero-call branch.
2. While `drain`, repeatedly invoke only the existing worker route for known active runs and the existing reaper RPC. Quiescence means zero `preparing|running` run, zero `queued|leased|retryable` job and zero unexpired owner lease under one database statement. No new job graph is admitted except deterministic successors of already committed predecessors. Drain lasts until quiescence or a fixed 30-minute deadline; an interruption resumes from immutable job state.
3. At quiescence, or immediately at the deadline/security emergency, change `drain -> disabled`, remove the V3 service/HMAC secret mapping from the application deployment and stop all worker/reaper calls. Nonterminal rows left by an emergency remain immutable non-public evidence; they are not deleted, cancelled by ad-hoc SQL or treated as success.
4. If application rollback is required, deploy the approved pre-V3 application ref only after `disabled` is observed. Never run a down migration: committed additive V3 schema, rows, role bindings, grants and audit evidence remain in place but unreachable without both deployment state and secret mapping. Legacy tables, grants, schedules and rows are never rewritten as compensation.
5. Re-run the exact immutable fixture and compare every field of the captured rollback lock before declaring rollback complete: byte-equal radar membership/order and recommendation publish timestamps; unchanged row counts plus canonical full-row hashes for `recommendations`, `strategy_actions` and `line_alert_events`; the legacy route-authorization probe hash; and the two-file schedule catalog hash. Live production rows may legitimately advance through legacy jobs and are not compared to a stale wall-clock snapshot; the immutable fixture is the compatibility oracle. Any fixture/catalog mismatch keeps the system disabled and is an incident, not an allowed repair.

Re-enable follows the reverse safety order, not the reverse destructive order: verify retained schema/catalog and legacy lock; deploy the reviewed V3 application in `disabled`; restore only the separately approved secret/binding mapping; enter `drain`; reap/finish or terminally fail every retained nonterminal run through cataloged RPCs; reproduce zero active work and shadow smoke evidence; switch to `shadow` with schedules still off; then separately re-enable schedules. A failure at any re-enable edge returns to the corresponding rollback node. Because `authoritative` is unparseable in this checkpoint, there is no authoritative-write rollback branch; any later promotion Change Gate must version this contract and add its own exact inverse/compensation DAG before that value can exist.

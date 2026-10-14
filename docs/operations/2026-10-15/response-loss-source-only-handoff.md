# Local PG response-loss transport: source-only candidate

Base `e24d3a1929a6c6ed66b2ba9ead6d222083b6c2e0`. Two new children (AUO currentv3; EMC compatiblev2) plus parent are **NOT_RUN**. No socket, PostgreSQL, application import, HTTP, or prior native/pure matrix was executed in this task. Node syntax and hermetic backend-frame probes are separate scope. No production/controller/SQL/schema/binding/role/grant/cap/authority/pin/workflow change.

## Reuse and fixed ownership

No existing PG response-loss relay was found in the current fixture helpers/scripts. Existing HTTP/performance servers do not supply a PG framing or zero-response boundary. This adds one private builtins-only Unix relay, one new native entry, and a lazy fixture factory. Original captured50/26/candidate36/local two-owner USAGE setup, original lawful roster→lease-scoped source→priority enqueue→claim/reservation→neutral preparation, pinned original financial data and controller remain untouched.

`createResponseLossLab()` takes no path/host/port/request selector. It closes over the existing fresh fixture base and port, creates a private0700 relay subdirectory, and pins upstream to that same cluster's `.s.PGSQL.<port>` Unix socket. No TCP/HTTP/connectors. The helper rejects PG-prefixed environment variables for this opt-in factory, uses explicit local host/port/database/user, ssl=false, and a password callback which refuses authentication rather than reading credentials. The lab connection's existing ability to SET ROLE service_role is inherited from the same synthetic local engineering context; no role/grant is added. This is not formal peer authentication. Default cases do not call the factory, allocate connections, listen, or gain extra cleanup output.

Every proxy client enters the original fixture client set before connect. A transport cleanup callback is registered before connection. The factory's query wrapper tracks actual pg promises until their real settlement; it does not race/replace them with timeout results. Final cleanup closes relay sockets, waits pending query settlement, then normal fixture clients/cluster cleanup proceeds. Transport cleanup errors are recorded and cannot return success. Partial startup paths are source-reviewed candidates only, not live-verified cleanup.

## Transport and exact success gate

1. Single accepted downstream client; its frontend bytes pipe unchanged to the fixed upstream Unix socket. Backend frames are validated while ordinary responses pass through. Prior real PG queries must have settled, parser buffer empty and last ReadyForQuery idle before arm.
2. Only the native adapter immediately before the actual seal RPC arms the relay. Pre/body/post and all9/6 FD closes must already have occurred. No original source/controller code changes.
3. From arm onward every backend chunk is held and bounded. No held byte is forwarded. The counter compares actual total forwarded-byte writes with the captured count at arm; it is not merely an asserted zero constant.
4. Framing uses5-byte headers, length>=4, total frame/buffer<=4MiB, <=4096 frames, and held-response aggregate<=4MiB. Fragmented/coalesced messages are handled. ErrorResponse, invalid lengths/types, extra data after Ready, non-idle Ready, or timeout fail closed. Successful gating requires exactly one complete `CommandComplete` with **exact bytes** `SELECT 1\0`, one DataRow, no ErrorResponse, and ReadyForQuery `I`; ReadyI alone is insufficient.
5. Before destroying either socket, the independent existing read-only observer must find exactly one stored row for the preparation, exact canonical request/request hash/input hash/wire version and false capabilities, count2 and the full ledger. Other8 tables/preparation rows/source fence events/invalidations stay equal to pre-seal. Charge must equal original preparation charge plus original stored revision charge. This observes actual commit from another backend, not a SQL mock or response throw.
6. Only after those checks are sockets destroyed without forwarding held bytes. Both actual socket close events are awaited. The controller must reject with the **same Error object returned by its actual pg query promise**, not a deadline facade, and that query must really settle. The successful relay receipt is a separate necessary gate; arbitrary connection errors cannot satisfy the native case.
7. Caller outcome is recorded uncertain until reconciliation. A new tracked service_role connection reads the same exact request after deleting only the two owned financial fixture roots. Both current read(false) and seal replay(true) must return the original persisted row/request/input/hash/clocks, call only the read RPC, have0 new FS/charge and keep full9 tables/full ledger/source events/invalidations unchanged. No automatic prepare/claim/renew or new request.

The relay has a5s test-containment timer beginning at arm. It never extends the original10s controller/session budget or turns unconfirmed IO into success. On timeout it destroys owned sockets and still waits actual confirmation-query and socket settlement; a live unresolved operation remains pending, not a cleanup success. Other original30s child/120s preparation/4slot524288/source<=30/material limits are unchanged. Four MiB is a transport-test containment cap, not a widened product bound or a total-memory claim. JS base64 strings cannot be wiped; held protocol copies are private, owned buffers are wiped on finish, and no private body goes to public evidence.

## Source-only verification and retained RED

Three changed/new `.mjs` files receive Node22.14 `--check`. A separate hermetic probe imports only the transport's builtin dependencies and never invokes its socket factory. It covers all single split positions, selected byte-sized fragment widths, coalesced frames, error/idle-only/non-idle/wrong-command/trailing/incomplete responses, invalid length/oversize/frame-count limits and pending-buffer wipe.

A genuine new hermetic RED was preserved: ASCII decoding could mask high-bit CommandComplete bytes into `SELECT 1`. The private test helper was changed to exact Buffer equality; the added counterexample then rejects. This is a helper/parser correction, not a native result or product expectation change. Prior source-withdrawal4PASS, old77/cross-wire/byte green, all original RED and private raw remain historical and were not rerun.

## Future command — NOT EXECUTED

After separate source review and explicit heavy release, use the known Node22.14/PG17.11 context, OS USER, unchanged proxy/CA, and a fresh absent short absolute private artifact directory:

```sh
RESEARCH_PREREQUISITE_PROFILE_ARTIFACTS=/tmp/response-loss-exec-UNIQUE \
node --import ./scripts/opportunity-v3/research-versioned-prerequisite-fs-witness.mjs \
  --experimental-strip-types --test --test-concurrency=1 \
  scripts/opportunity-v3/research-versioned-response-loss-native.test.mjs
```

Raw protocol/base64, payload, principals, URLs, ledger rows and logs stay private local. Public evidence must expose only source identities/hashes/counts/frame types/zero-forwarded/actual commit/FD/PIDs/close/charge/pending. Future execution must independently inspect backend absence and relay path removal; source-only declarations are not cleanup proof.

Pending: both real socket/PG children+parent; actual relay connect/error/backpressure/close behavior, observer gate latency and existing10s compatibility, real caller rejection and missing-root reconciliation, process/FD/cluster cleanup. Old77 transport loss, other lease/lockwait races, whole S/C/B/Q/R/A, all four callers, cash citations, active production writer/private peer/live source and formal author-review-publication remain outside this slice. No PR/ref/CI run/merge/deploy or independent approval is created.

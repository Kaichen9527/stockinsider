# Legacy77 child lifecycle correction — native remains NOT_RUN

Base `6a136516934a3fe8442a47b55c8f450b897102a5`, original helper SHA256 `ea7f86ad00baddda9684b2ccd139ff61373e6ab142c1d5337d7fe282e4a1b2fe`. Root's independent original P2 and the original source-only receipt remain historical. This is a maker repair, not independent approval.

Only the private helper child lifecycle and a standalone hermetic probe change. Original source capsule, child producer driver, business native assertions, SQL, grants, material/clock/caps/authority are unchanged.

## Behavior

An `error` stores the primary transport error and attempts SIGKILL only for this owned child when a PID/spawn has been observed and exit/close has not occurred. Error does not resolve termination, clear the watchdog, write a cleanup receipt, or permit success. A failed spawn awaits Node's `close` event and reports `spawnFailed:true`, `confirmedChildExit:false`; it is not a running child death observation.

`exit` is retained separately. The promise waits for `close`, which is Node's process/stdio termination event, before clearing the unchanged30s containment timer, waiting for pending actual RPC promises, and saving the completed stdout/stderr. Success requires both an actual exit and close with exit0, no pending RPC, and all existing result/FD assertions. Error remains the thrown outcome even if cleanup subsequently confirms termination. Kill failures are recorded and do not confer cleanup. No timer or error fabricates a close; if the platform never confirms close, completion remains unresolved. The30s watchdog does not extend the original producer10s deadline or claim kernel query cancellation.

The RPC transport now handles send callback/synchronous errors through the same lifecycle path; query ownership lasts to actual settlement. This does not change original producer abort/deadline semantics or the actual SQL calls.

## Hermetic checks

The new `research-legacy77-child-lifecycle.test.mjs` imports only the builtin-only private helper. It replaces fork with an EventEmitter child and restores builtins after each serial case. Its query callback is a deferred promise in the pending-settlement case, **not** a PG assertion or a substitute for native validation.

Five cases cover error while alive (watchdog retained/kill/waitclose), failed spawn with no invented exit, exit followed by late stdio before close, normal exit/close, and close before pending RPC settlement. Direct Node execution runs builtin `node:test` and emits TAP without an outer test subprocess. Original `--test` invocation produced a file-level failure without the internal diagnostic; it remains separately preserved and is not attributed to the product. The first probe draft also had a syntax error, preserved separately. After that harness correction, original helper behavior produced the intended assertion RED (`error is not child termination`, actual settled=true).

No original application module, producer, PG, native business case, build, dependency install or browser is run. The original two issuer native children plus parent remain **NOT_RUN**. Real OS spawn/kill/stdout behavior, original firstseal and missing-root replay, actual PG settlement and service cleanup still require the separately authorized native run. The mocked five cases do not certify those stages or historical compiled Next identity.

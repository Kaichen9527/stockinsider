# Fixed HTTP child phases and first-error preservation

The actual receipt at `0b122de7e3e6c6921c141078b2eeb9422a6ae495`,
`contabo-t18-market-metadata-real-http-timeout.json` (Gitblob
`de91df54936bbab54987c10a87dfcc2922c16e40`), remains unchanged. It records
fixed_http_exercise / timeout with cleanup and production signatures verified.
Its precise child phase, metadata/URL result and detail HTTP result remain
UNCONFIRMED. The source defects below are possible masking paths, not a diagnosis
of that historical run. No new real-backup replay was done by Cloud.

## Closed future diagnostics

Only a controller-local trace, after the existing private detail preparation,
records fixed boolean completion stages. Nested child scopes preserve the first
ReadpointRejected. Final cleanup can add completion flags but cannot replace that
error's phase/class/child label. ContextVars are reset on exit, including failure.
There is no transfer of trace state to HTTP request threads or external callers.

Legacy phase/errorClass diagnostics remain accepted. Traced diagnostics can add
`completedStages` and, for child operations, `httpSubphase`. The strict projector
accepts only compiled enum strings and the exact set of 19 boolean fields. Extra
keys, missing flags, non-boolean values and invalid phase/child combinations
refuse. These fields are never inspected to authorize, retry, skip a gate or
choose data/routes/commands. No SQL, URL, raw error string, row, ID, filename,
credential or observed size is added to diagnostics.

Child scopes distinguish:

- Proxy validation/bind/thread start, and proxy stop.
- Six existing proxy refusal probes, the first existing direct REST response,
  and the remaining REST refusal validation.
- First A, B, return A, fault B and recovered A: fixed start, static asset
  selection, daily, home, static and applicable stop operations.
- Fault injection, observed failure and sequence-final stop.
- Fixed detail A/B: start, API readiness, payload checks, page HTTP/decode/parse/
  original date and body checks, identity refusals, stop and final stop.
- APP/REST shutdown acknowledgements, all three fixed closed-port checks and APP
  transport close.

`restTargetResponded` means the existing first direct REST refusal request got a
bounded HTTP response. It does NOT certify authorized reads, DB readiness or all
REST health. `rest_configure` remains a separate existing phase whose broker
already performs its fixed SQL/version/readiness checks; that wire is unchanged.
No extra readiness request or route was introduced.

Flags distinguish preparation completion, a GAP, specifically a BOUNDS GAP and
an actual prepared private read object. They are set from that invocation's
internal result, never a receipt or caller assertion. Health flags record passed
daily, home and static checks, not whole release promotion. Shutdown flags describe
validated acknowledgements, not independently observed OS-unit exit. A skipped
detail exercise never sets detailHttpPassed. Cleanup flags reflect completed
actions after all attempts; a false value is not a new root-cause assertion.

Timeout classification retains a last exhausted daily TimeoutError and recognizes
only the two exact typed internal deadline codes. It does not parse arbitrary
exception messages. Unknown exceptions remain a fixed unexpected class.

## Cleanup and unchanged acceptance

The sequence's final STOP_NEXT now preserves an earlier failure. Proxy cleanup
attempts accepted-socket shutdown, serve-loop shutdown when its thread is alive,
server close and bounded join even if an earlier action fails. A failed thread
start cannot call shutdown on an unstarted serve loop. A body error wins; without
one, the first cleanup error still rejects with its fixed class. Low-level HTTP
timer cancel/join and connection close also attempt every action and preserve an
earlier error, including a failure sending an upstream rejection response.

Both broker shutdowns and all three existing port confirmations are attempted;
one failure does not suppress the others. The outer APP context close cannot
replace the earlier failure, including a fresh binding/budget failure. On binding
failure before the budget is admitted, only the opened transport is closed; no
new operational authority is inferred. Secret wiping remains in the outermost
finally. A cleanup-only failure never becomes success.

The owned-PG engine and host cleanup gate are unchanged. A diagnostic is still
withheld if owned clone cleanup is not verified. These changes do not promise
diagnostic output when the broader engine/host cleanup itself fails.

All routes, request/response/header budgets, loopback ports, authentication,
JWT lifetime/minimum remaining, release pins, retry counts, sleeps, deadlines,
resource limits, SQL, raw-map validation, URL policy, RLS/grants and original RPC
restrictions remain. Daily, home and static request order is retained, including the
original static request before combined validation. Exact baseline differential
tests compare the 24 successful negative/health/fault HTTP calls and broker ops.
Acceptance validators and fixed constants also compare byte/AST-identical.

## Verification and staging

Synthetic fault tests exercise every closed label, startup refusal, late cleanup
errors, page decode, primary timeout preservation and exact projector privacy.
Real owned PG17 exercises an actual BOUNDS GAP versus a prepared private read
followed by timeout, preserving rows and cleaning the proxy. Kernel/three-unit
admission is not replaced: injected control handles only test private routing.
Generated Python HTTP children exercise actual A/B/A and failure recovery; they
are not the pinned native Next/PostgREST binaries or real-backup acceptance.

Use `t18-http-subphase-stage-manifest.json`: four runtime replacements; no new
runtime files, and 51 blobs remain 51. Baseline includes the original native and
T16 evidence. The source receipt records regression, independent review and the
required web-build limitation (bridge passes; isolated Next executable missing).
Cloud also checked the private receive inbox without reading browser data; an
absent file is not download verification. No private receive path or filename is
included here or in Git evidence. Contabo, true backup, production and HOLD were
not operated or changed by this task.

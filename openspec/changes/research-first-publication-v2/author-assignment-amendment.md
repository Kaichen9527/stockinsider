# Private original author assignment — bounded persistence slice

This continues the reviewed private controller identity helper. It adds one private immutable author assignment per original job/attempt, using the already charged company_research reservation and a sealed complete input. No new model reservation, lease renewal, budget refund, dispatch, completion, review, publication or eligibility is produced.

The future guarded existing model-reservation endpoint resolves the matched author credential and current compiled input mapping before calling the RPC. The principal argument is a private server-derived credential hash; it is never a caller/model authorId and never goes into a model prompt. This migration does not itself authenticate an HTTP credential. Only the trusted service role may call the bounded RPCs; anonymous/authenticated users and direct service table writes are denied. Genuine endpoint/adapter integration remains required before product use.

Assignment admission/read uses the existing complete-input read RPC with the exact original canonical request. That rechecks the preparation, job/attempt/owner/reservation, current DB mapping, source seal, clocks and source→global-deep lock order. The assignment additionally binds complete revision/hash/company/snapshot, canonical input hash, original owner, original reservation start and both original deadlines. It retains the original clocks exactly. The creator inserts only after checking these live fences and checks the deadline again before return. No freshness rule can renew a deadline.

One assignment per job/attempt is intentional. Same principal, input revision/hash and canonical request replay returns the original bytes/time/id. A different credential (including rotation), revision or input cannot adopt/rewrite it. Failed or expired attempts use the existing retry mechanism; no silent new assignment in the same attempt. Read/replay fail closed on expired/completed/taken-over/withdrawn inputs. Invocation uniqueness, result persistence and atomic author handoff will follow in the next slice, not be inferred from this assignment.

Tests use isolated real PostgreSQL and the actual source/preparation/complete-input predecessor functions. Synthetic private seeded complete rows are explicitly assignment fixtures, not financial acceptance or actual model execution. Verify immutable ACLs, replay/restart, competing admission, input/principal mismatch, unchanged reservation counts, source withdrawal and expiration. The complete-input predecessor used in tests is pinned separately and remains under its own review/fix; this migration must not be deployed ahead of an accepted predecessor or the guarded route.

The first publication plan's actual author/reviewer and final release requirements remain unchanged. A saved assignment alone does not make an article publishable.

## Guarded existing route adapter

The existing research-model-reservation endpoint gains an explicit
`x-research-execution-version:2` branch with exactly action,input,inputRevisionId,
inputHash. Actions are assignAuthor/readAuthorAssignment. The original unmarked
v1 reserve/finish branches and role rules remain unchanged. The v2 path first
requires exact internal bearer and resolves the configured distinct author
credential; reviewer/test/cron, credential aliases and caller principal/authorId
are rejected before body/DB I/O. It reads at most8192 UTF-8 bytes under the existing
10-second shared deadline, rejecting duplicate/unknown keys.

Every admission and read runs the actual complete-input read path with seal=false
so the current compiled mapping, canonical payload/hash/subhash/schema and false
capabilities are revalidated without calculation/artifact I/O or a new revision.
Only then is the assignment RPC invoked with the server-derived private principal
and exact revision/hash/original request. SQL rechecks original live source/job/
reservation fences atomically. Returned bindings/clocks must match; principal and
canonical request stay private. Success still says dispatchReady=false and
modelDispatched=false. Uncertain write response requires readAuthorAssignment
reconciliation with the same original input, never a new claim/reservation.

The real PG test now loads the tracked predecessor migration by default. The
manual pinned-Git fallback remains explicit and cannot silently become CI input.
Transport/auth tests use actual route and helpers with clearly labelled mocked
DB/current-input boundaries; they do not replace native HTTP acceptance. A new
native fixture uses existing isolated PG/PostgREST/compiled Next harness and
actual fixed company calculations, plus ephemeral test-only separate credentials.
All inherited credentials remain excluded and every temporary key is redacted.
Native verification is a separate command and must actually run before this
route is accepted; no model execution or publication proof follows from it.

Complete-input0d has an independently reported closure-encoding P2 pending VM
repair. This development branch stages that predecessor to compile/test the
adapter; staging is not integration approval. No main/deployment authority is
inferred and the accepted repaired successor must replace it before integration.

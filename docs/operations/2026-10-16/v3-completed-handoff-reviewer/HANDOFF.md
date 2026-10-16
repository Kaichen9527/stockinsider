# Completed handoff and reviewer packet — unactivated source candidate

Base: `87b197eddf452d6144f906b54b184f1af9f4adc9`. This source slice implements private server composition for the **uninstalled** handoff binding-fence SQL candidate `259264b8ed17df0ffb38b19efd0e05bfbaaf3a98`. It does not install SQL, expose an HTTP route, assign a real person/model, or publish an article. Maker evidence is not independent approval.

The candidate now supports first author handoff, completed READ, exact completion replay, explicit READ recovery after uncertain mutation outcome, distinct reviewer assignment/READ, and a full reviewer packet. Every v3 path requires the five-key current handoff context (`assignment`, `result`, `revision`, `completion`, `binding`). An old four-key context is rejected. No legacy fallback, `skipLive`, caller `validated` flag, or service-role private resolver call exists.

## Exact source changes

- `research-v3-author-handoff.ts`: current binding must exactly equal the server-retained parsed core, registration/template and Hb/inventory; compiled fingerprint must equal the captured server executor identity. Revalidates closed stored rows, requests, tagged hashes/bytes, assignment/principal/reservation/observation, original clocks, article arithmetic and every typed cash reference. Captures detached RPC snapshots before later calls. Completed paths never call active input/result READ.
- `research-v3-reviewer-assignment.ts`: existing seven-parameter context/assign/sources RPCs only. Requires author completion and distinct configured reviewer credential/principal, exact reviewer assignment/reservation and original windows. READ never reserves or assigns. Sources are checked against immutable manifest and article descriptors. Final context equality/fence follows all calculation and serialization, before return.
- `research-versioned-complete-input.ts`: moves the existing select/response-validator statements into a pure export. Original `runCompleteInput` code, including legacy and fresh dispatch, is byte-exact.
- `research-v3-article-citations.ts`: reuses the exact arithmetic/node/citation body for a pure stored-context seam. Active READ still goes through the real original controller; stored seam additionally runs the same complete response validator. This seam establishes data consistency only, never DB authority.
- `research-v3-business-article.ts`: adds a pure stored method invoking the unchanged full article validator and cash/scenario revalidation. Original active method and article core remain byte-exact.
- `research-v3-author-result.ts`: only adds `export` to the existing pure `projectResearchAuthorPacket` declaration. Full remainder of file, including durable receive/read behavior, is byte-exact.
- Focused test file changes its historical completed/reviewer fail-closed expectations to the new five-key candidate contract, retaining four-key failure tests. Old source and RED evidence remain at their original commits.

`original-seam-pins.json` records exact base Git blobs and extracted-byte hashes. `source-parity-checks.mjs` checks six exact fragments/files plus all inherited inputs/frozen SQL. New source identity does **not** reuse old whole Hs/Hc, Next build identity or native receipts. Existing descriptors/bindings/SQL profiles are unchanged, not regenerated or claimed approved for this code. Contract fixture Hs is only its actual citation-module hash and Hc is the actual Node binary: partial engineering identities, never whole S/C/B/Q/R/A. The runtime check compares the binding with the trusted server-configured executor fingerprint; it does not independently measure a compiled Next executor or grant approval.

## RPC and outcome contracts

| Action | RPC sequence | Mutation / recovery |
| --- | --- | --- |
| first handoff | context → pure full validation → context → commit → context | Existing six-parameter completion RPC only; final original result/input/binding and receipt must match. |
| completion READ | context → pure full validation → context | No mutation, active input/result READ, FS, claim, renew, prepare, seal, receive or model call. |
| explicit handoff replay | context → pure full validation → context → commit → context | Original SQL exact replay returns original receipt. No changed completion clock accepted. |
| reviewer assignment | reviewer context → full author validation → assign → reviewer context → final context | Existing counter_review reservation API/quotas; returned assignment exactly matches fresh context. Null remains no assignment. |
| reviewer assignment READ | reviewer context → full validation → final context | Never calls assign. |
| reviewer packet READ | reviewer context → full validation → sources → packet/source validation + serialization → final context | Never calls assign/active input READ/FS or model. |

Actual transport errors propagate as the same Error object. Mutation outcome is uncertain, not successful. There is no automatic resend, renew, re-receive or refund. Explicit READ reacquires the current context and reconstructs the receipt/assignment/packet; mock transport loss tests do not prove a DB COMMIT or real socket settlement.

The existing SQL handoff context still requires the original author reservation/job window to be unexpired even after completion. This candidate retains that bound, the original reviewer counter_review window, and the shared 10-second FinancialIoDeadline. It neither extends a reservation nor treats a cached citation set as a live lease. A read tombstone/source withdrawal at the first or final RPC propagates without returning a packet.

## Closed packet

`research-reviewer-packet-v3-candidate` is constructed from a finite field map. Research identity, sources, source-clock/evidence meanings, financial projection/calculation, gaps and capabilities are retained at their original depth. Author assignment identity/window are named `authorAssignmentId` / `authorWritingWindow`; reviewer assignment identity and writing window are separate. Includes original full raw article, all seven sections, tables, catalysts, counterevidence, valuations and null targets, immutable author result/hash/receipt, request hash, binding core/Hb, validator version and finite citation context. It does not dump an unbounded full-node catalogue. Financial table references retain typed values, periods, units, classification, operands and locators via the unchanged validator. Metadata never becomes a financial fact.

Packet and outer response are cloned and recursively frozen; `packetHash` uses the original tagged completeHash with depth12. The original source307200, article262144, packet/receive1MiB, review65536 and body8192 limits remain. No text is truncated. All publication/research/financial/PIT/strategy/entry/dispatch/valuation/technical qualifications remain false, with forecastCash null and noFutureCash true. The packet does not assert independent semantic review, source authority or formal reviewer execution.

## Evidence and limits

Only Node22.14 pure source contracts, static byte parity and strict module-only TypeScript5.9.3 were run. Final new integration contracts: 26 PASS/0 fail/cancel/skip/todo. Necessary changed-seam citation regression: 20 PASS/0 fail/cancel/skip/todo. Static parity: 7 PASS/0 fail/cancel/skip/todo. Strict module-only TypeScript5.9.3 exit0. These are separate checks, not a combined native count. Exact commands, source seal, sampled process-tree RSS/free floors and published hash inventory are in this task's receipt. Full pinned AUO/EMC material and full draft text are used with explicitly synthetic RPC/source/role/observation fixtures. Original prose mapping is still nonsemantic and cannot establish actual claim support. No native/PG/socket/HTTP/Next build or production operation ran.

Initial typecheck RED (two closure narrowing errors) is retained; correction captures already authenticated primitive principals. Initial parity checker RED (Node child Git EPERM: 2 PASS/5 FAIL) is retained; Git-derived fixed fragment pins avoid child execution without changing comparisons. Intermediate 24/26 contract runs are not added to the final count. Historical be6 errors, all prior native failures/successes and uninstalled SQL status are unchanged.

## Required next acceptance — NOT RUN

1. Root exact-source review, then a separately authorized fresh PG installation of the frozen binding-fence SQL after c08, complete catalog/ACL/OID checks and first/completed handoff/replay/recovery/reviewer packet through real RPCs.
2. Actual binding/source revocation, legacy77/compatible-v2, role/lease/rights/caps/ACL and real handoff/assignment response-loss acceptance. No old native PASS is relabelled for these changed TS modules.
3. Actual four caller/routes, distinct reviewer execution and reviewer-result/editorial/Q-R/review-pack finite unions, atomic publication and whole S/C/B/Q/R/A remain pending. No reviewer-result or publication success path is fabricated here.
4. Independent claim-by-claim semantic review, real source/principal rights, both formal articles, Top20 source coverage, technical/strategy/research scheduling and fixed peer installation remain pending. DD one-shot and terminal PRs were not touched.

Stop after this delivery for Root review; do not auto-start native or another task.

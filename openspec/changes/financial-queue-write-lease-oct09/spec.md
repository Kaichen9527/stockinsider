# Financial queue write-lease repair

## Problem and evidence

The deployed `9fd86fe620ccc63c89c4acd208327bf2c4e15332` financial queue drain fetched 11 documents for the 2026-10-08 session but wrote zero: every artifact receipt failed with `stockinsider_backend_lease_required`. Read-only journal observation on 2026-10-09 identified that the authenticated queue entry calls acquisition and validation without the existing production write lease. The document upload/worker entry already acquires that lease; this entry was omitted.

## Bounded requirements

1. Keep exact internal bearer, active VPS writer, request/body limits, official candidate filtering, provider limits, and financial result semantics unchanged.
2. Before either `refreshCandidateOfficialFinancials` or `validatePendingOfficialFinancials`, acquire the existing `production-data-plane` lease with a 3,600-second TTL using the existing helper. This patch does not redesign or claim stronger authority for that helper.
3. Acquisition failure returns 503 `production_write_lease_unavailable`; contention returns 409 `production_write_cycle_already_running`. Neither path calls either mutating worker or releases another owner's lease.
4. A `finally` block releases exactly the acquired owner once after successful, partial, failed, or thrown worker results. A release exception cannot become a reported success. No stale lease recovery, SQL, ownership substitution, or direct production mutation is added.
5. Existing read-only early returns, including no due jobs, do not acquire a lease. The nonempty candidate path retains existing behavior.
6. Executable focused tests run the actual route with synthetic boundary adapters. Real-stack acceptance and full type/lint/build checks run on the Codex VM before a release claim. This repair alone does not authorize merge/deploy or prove financial coverage.

## Acceptance inventory

- FQL-01: Unauthorized, malformed/oversized/invalid requests and inactive writer do not acquire or mutate.
- FQL-02: No due jobs returns the existing empty result without lease operations.
- FQL-03: Backlog, stock, or instrument read failure does not acquire or mutate.
- FQL-04: Busy and unavailable lease return distinct 409/503 failures without worker calls or release.
- FQL-05: Success acquires before refresh and validation; original limit/candidates/session/result are retained; exact owner is released last once.
- FQL-06: Acquisition failures and incomplete validation retain original error/status semantics and still release.
- FQL-07: Refresh or validation throws release once, preserve the exception, and do not call later work.
- FQL-08: Release failure cannot report a successful response.

## Non-goals

No financial policy/history/schema change; no new artifact system; no proof of lease incarnation fencing; no protected review bypass, live queue execution, production configuration, source credentials, or cleanup.

## CI integration repair, independently reviewed before implementation

Ordinary CI at docs head `549d97a48fbcb0c5c2ba3905a6b0b9e2c5acad9a` exposed 21 failures outside the queue behavior: two strict PostgreSQL suites only recognized a VM-specific environment variable, and 19 priority route cases omitted a newly required actual module. The original 561,223-byte log (SHA256 `c89e336a7814d8e0e92d1922317552897586a3e25216cf5b12b89cea48d509aa`) is preserved.

Bounded test-only requirements (unsigned independent design PASS, 2026-10-09): select a nonempty explicit `RESEARCH_LOCAL_DATAPLANE_PG_BIN` first, then nonempty protected `OPPORTUNITY_V3_POSTGRES_BIN`, otherwise fixed `pg_config --bindir` with a five-second / 4096-byte bound. A nonempty invalid explicit path cannot fall through. Discovery failure keeps the existing strict unavailable assertion; no skip, mock DB, workflow, SQL or acceptance relaxation. Apply the already reviewed `42e16135708780c5fbc5b559d5beb59db9fe326c` priority contract diff only, importing the real module and preserving formal/observed scope assertions.

CI-FQL-01: exact queue/document plus repaired priority selection passes without skips; unrelated scope cannot obtain formal priority. CI-FQL-02: ordinary CI actually runs both strict PG suites via the installed tools; absence still fails. CI-FQL-03: preserve original RED and distinguish the new combined test subject from unchanged queue runtime.

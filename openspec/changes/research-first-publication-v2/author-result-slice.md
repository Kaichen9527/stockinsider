# Private author result reception — bounded continuation

Continue the existing marker2 author endpoint, original assignment, sealed
complete input and selected public packet. Implement receiveAuthorResult and
readAuthorResult through the same exact author Bearer credential. This slice
persists a private contract-valid draft plus a controller execution report. It
does not dispatch, complete a reservation, review, publish or grant eligibility.
Actual tool-driven author execution and atomic handoff remain required; a saved
controller report is not a provider signature or proof of platform execution.

Receive's closed body contains action,input,inputRevisionId,inputHash,article,
observation. Read uses the original four-key identity body. Model content never
selects a principal, expected owner, role, clock, financial value or source.
Reject mismatched credentials and unmarked/v1 downgrade before DB access.

For receive, load the live original complete input and public author packet,
actually recalculate and validate the business article with the server-resolved
source descriptors. Compute outputHash from raw article and articleHash from
the validated snapshot. Bind the closed controller observation using the
existing execution-binding helper to the stored assignment/job/reservation,
server principal and receive clock. Require author start <= authoredAt <= end;
cutoff precedes start, assignment precedes start and original exclusive deadlines
still apply. Unknown provider identity stays null. No caller IDs supply expected
authority. The observation remains trusted_controller_observation only.

An additive private immutable research_author_results_v2 table holds at most one
result per assignment, plus globally unique author invocation ID. A later review
slice must enforce invocation uniqueness across both roles as well. Bound the
whole canonical persisted result envelope to 1MiB; raw article stays 262144B.
Database calculates the hash/byte charge. No direct table mutation for service,
anon or authenticated roles. Only scoped SECURITY DEFINER RPCs may insert/read,
with fixed search_path and existing immutable mutation trigger.

Both RPCs use the existing assignment context, retaining source→global-deep lock
order and original owner/job/attempt/reservation/source fences. Receive verifies
exact closed envelope shape, article/output hashes, identity bindings, invocation
uniqueness, original clocks and final SQL clock after locking, then inserts once.
Exact replay revalidates live context and original byte equality, adds no charge;
changed result/invocation conflicts fail. Concurrent last-slot insertion produces
one result only. Read is private, preserves original bytes and fails after expiry,
withdrawal, takeover or reservation completion. This deliberate active-work read
must not later be confused with a publication/audit reader after handoff.

Failure changes no job/reservation/completion, input, source, formal catalog,
qualification, outbox or ledger. An uncertain receive is reconciled by exact read,
never automatic new claim or renewed clocks. Keep all capability flags false and
retain the pure validator's limitations; record is not semantic citation review.

Acceptance: actual pure calculator for both companies; auth/closed body; article
or observation/hash/clock mismatches; authoredAt outside actual author interval;
duplicate invocation across assignments; exact replay, conflicting/concurrent
receive, immutable ACL, source withdrawal, expiry and unchanged charged model
budget. Tests use labelled synthetic controller observations and isolated PG,
never retroactively wrap prior engineering as a product role execution. Native
HTTP, independent code review, types/lint/build are required before integration.

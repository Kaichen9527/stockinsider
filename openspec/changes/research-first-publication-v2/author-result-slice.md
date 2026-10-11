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

To preserve the existing 8192-byte path unchanged, this result-only branch also
requires x-research-author-result-action equal to receiveAuthorResult or
readAuthorResult, alongside the existing x-research-execution-version:2. The
closed body action must match that header. Missing/unknown result discriminators
cannot enter a result RPC. Existing assignment/packet actions retain their old
parser and8192-byte bound. Result read is8192 wire bytes; receive is1048576 wire
bytes, counted while streaming before UTF-8 decoding. Use the existing strict
duplicate-decoded-key and depth12 parser, reject invalid UTF-8, and cancel on
failure. Raw article262144 serialized UTF-8 bytes and canonical durable envelope
1048576 bytes are separate checks, not substitutes for the wire limit.

One original FinancialDeadline covers authentication-following body read, every
RPC, actual recalculation, validation, canonicalization and response serialization.
Check it after CPU work and after Response creation; do not renew it or either
original job/reservation deadline. A stalled read/RPC uses abort/cancellation;
do not launch work before deadline admission. Exact/+1 wire/article/envelope,
duplicate/deep/invalid UTF-8, stalled I/O, expiry during calculation/serialization
and uncertain-write exact-read reconciliation are executable acceptance cases.

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

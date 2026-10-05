# Trusted deep-work consumer v1

Approved parent scope: `research-strategy-agents-v1`, including the Cloud-primary
transition. Implement only the existing writer claim/status boundary.

1. A single claim uses the server-selected job and real model reservation;
   caller-selected stocks, invented clocks/IDs and automatic retry are forbidden.
2. Fsync a private original request before sending. On ambiguous response,
   recover by owner-scoped status only; preserve original job/attempt deadlines.
3. Bind recovery to original owner/origin/source/request and saved receipt hashes.
   Refuse shared credentials, unsafe origins, dirty source, aliased output paths,
   symlink journal, public journal permissions and malformed/future contexts.
4. Finite transport/body bounds include the entire body. Never persist arbitrary
   upstream error strings or credentials.
5. Distinguish no claimable job, no active owned job, accounting handoff, actual
   model dispatch, draft persistence and publication. This scope does none of the
   last three and changes no strategy, schema, budget or expiry.

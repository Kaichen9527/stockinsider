# Bounded technical worklist consumer

This implements the already-approved qualified/held-company technical monitoring
consumer using existing authenticated worklist and snapshot routes. It introduces
no schema, public endpoint, model provider, publication or scheduling change.

The trusted controller reads authoritative membership; callers cannot choose a
stock subset. It validates worklist clocks, both book heads, unique membership,
held-symbol coverage and due-review identities. Existing holdings are processed
first. Each snapshot request supplies only the symbol: the server rechecks current
qualification, evidence, liquidity, strategy and official-market authority.
No older worklist cutoff or client eligibility replaces those server checks.

A batch admits at most 32 snapshot requests and 55 seconds of transport/computation
time, with a 15-second per-request/body deadline and a 4 MB response limit. All
remaining symbols receive a deferred disposition. Failed snapshots do not count
as saved. Network or response-binding ambiguity stops further writes, preserves
the original worklist and completed responses in a fsynced journal, and never
automatically retries. Fresh runs use exclusive files; uncertain operations need
operator reconciliation. This fixed batch is not fair resume or full coverage.

HTTPS or an explicit IPv4-loopback HTTP tunnel is required. The distinct writer
credential remains solely in the trusted process. Redirects, caller headers,
public plaintext transport, role-key sharing and arbitrary error/prose export
are rejected. Mode-0600 journal/output destinations are acquired before requests.
Verified final receipts are fsynced to the journal before destination persistence.

Monthly-due work remains independent_review_required. No model is dispatched,
qualification renewed, paper position marked or strategy approved by this
consumer. Technical snapshots are not a paper-risk or trade-completion claim.
No model minutes are represented as spent: this performs deterministic server
calculations only. Production activation still requires protected release,
reviewed schema/runtime roles, capacity admission and live acceptance.

Acceptance covers held-first membership, every deferred symbol, expiry and latest
invalidation, explicit server gaps, network ambiguity, clock/identity conflicts,
unsafe transport, credential sharing, immutable files and real HTTP redirects.

# Cloud controller handoff

The existing approved Cloud transition uses the existing independent-test bearer,
model reservation and authenticated result receiver. This bounded controller
implements the missing client bridge; it introduces no schema, public endpoint,
model provider, scheduler or strategy approval.

Only deep_article_validation / independent_test / research_snapshot is admitted.
The controller checks a clean exact source before reserving. Work keys bind the
original input; the returned server lease supplies the actual reservation ID and
clock. Packets and JSONL operation journals are exclusive mode-0600 files.

Journal and output destinations are exclusively acquired and a request-pending
event fsynced before any request. There is no automatic network retry. Ambiguous
outcomes remain explicit; verified responses are fsynced to the journal before
destination persistence, allowing operator recovery without a second claim.
Budget denial returns a gap, not invented work. Credentials remain solely in the
trusted controller environment and never enter the work packet or journal.

Transport accepts an operator-supplied HTTPS origin or explicit IPv4 loopback
HTTP tunnel. Public plaintext HTTP, URL credentials/query/path, redirects and
shared role keys are rejected. Requests and responses have a 4 MB bound and
15-second transport deadline. No arbitrary route or header is supplied by input.

Result identity and deterministic article calculation are recomputed before
submission. A late identical artifact may be submitted only for the existing
receiver to distinguish a durable replay from an invalid late first submission;
the client cannot decide durable acceptance. Every returned handoff field is
bound and projected without arbitrary server extras. The receiver still verifies
live reservation, server sources and facts before atomic receipt/completion.

This implements one deterministic tester bridge, not all six model consumers.
Actual VPS/Cloud acceptance, authenticated source reading, independent editorial
roles, trusted runtime activation and five trading days remain separate gates.

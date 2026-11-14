# Binary64 writer-to-reader wire contract

Source **d68f5a33b8345e66fe324749101bd1f92abfdcc0** equals locally testedbd6bf3e's
whole tree; [separate machine receipt](launch-wire-checks.json) references the
[shared build/regression/failure evidence](launch-foundation-checks.json).
The user identified a genuine cross-runtime mismatch in96f4650: PostgreSQL NUMERIC
JSON `-0.2` differs from JavaScript `0.1-0.3`. The actual old parser was independently
reproduced rejecting decimal0.1 for0.3-0.2 while accepting its binary64 result.
That is a Node control, not proof of PostgreSQL execution.

The unreleased launch wire now requires `binary64-v1` at read/snapshot/current/
detail and write-v2 boundaries. Policyv1,16rules/comparisonsv5,70/20/10 weights,
null/full100 and total/technical/RS63/symbol ties remain. PostgreSQL must convert
operands to float8 BEFORE subtraction/division/comparisons/ties, serialize with
extra_float_digits3, reject nonfinite values and canonicalize zero positive.
Signed share sums remain exact NUMERIC/BigInt within safe bounds before conversion.
MA/ATR recurrences must preserve their defined ordered arithmetic; NUMERIC math
followed by a final float8 cast is a different contract. No epsilon or rounding
relaxes sign, score, one-ULP tampering or ties.

The production application now captures readAt after the awaited RPC response;
an in-flight SQL current check is not compared with an earlier request-entry time.
Future clocks, expiry and the maximum120-second interval remain strict. The16
unit cases include delayed valid/expired/future responses, tiny signed values,
known zero, adjacent thresholds, signed thirds and immutable tie checks. The first
fixture-union TS2339/build failure and its test-only narrowing repair are retained.

[SELECT vectors, stdin consumer and exact isolated handoff](../../../../web/scripts/launch-ranking-wire-replay.md)
are public source for17 full synthetic16-rule packets including±1/3 and reverse-
input equal-RS63 SQL ordering. The stdin-only consumer runs the actual parser,
bounds2MiB/fatalUTF8, emits no raw input and labels its origin unverified with all
authorities false. It cannot attest who produced an input or authorize a ranking.

**External synthetic PostgreSQL17.11 wire:17/17 PASS**, fixed Node22.14.0,
receipt[61f25d67](launch-wire-external-pg.json), Git blob2892ce9a. Root independently verified all
8 source-file Git/SHA256 identities and compared all17 receipt-reported raw-PG
and consumer byte-count/hash pairs; original PG bytes were not independently
rehashed in Cloud;
the reversed equal-RS symbol-order negative exited1. The first external observation
used Node22.23.1 and all17 were refused by the pinned-runtime guard; that failure
is retained. The corrected pinned binary SHA matches this VM's Node. These were
SELECT-only synthetic packets in an initially empty isolated scratch cluster,
not StockInsider product tables, a migration or a ranking. Cloud received the
sanitized metadata receipt, not the original PG response files.

**Cloud PostgreSQL execution and actual native PostgREST: NOT_RUN / HOLD.** The
consumer's own origin remains unverified and all authority flags remain false;
the separate external receipt provides provenance only for this synthetic wire
exercise. Product SQL grammar/catalog/RLS/ACL/COMMIT/CAS, actual source/current
qualification and two-close ranking acceptance remain separate. No production
connection, schema apply or held native retry occurred. Later captures cannot
establish11/12–13 online publication. Formal review and release gates remain.

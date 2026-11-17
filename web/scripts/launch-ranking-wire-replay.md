# Binary64 v2 wire replay — source-only handoff

The consumer runs the actual `parseLaunchRankingRead` against supplied JSON
bytes. It does not contact PostgreSQL, PostgREST, providers, files or a writer.
Its receipt explicitly reports `origin: unverified_stdin` and no authority.
An independent acquisition receipt is required to establish where bytes came
from. A Node-generated fixture is never PostgreSQL evidence.

The wire contract requires `binary64-v1` in the v2 read, snapshot, current
envelope and detail. Cast operands to PostgreSQL `double precision` **before**
subtraction, division, threshold comparison and RS63 ordering. Emit with
`extra_float_digits=3`; reject nonfinite values and canonicalize zero positive.
Raw signed share sums remain exact NUMERIC/BigInt with safe-range validation
before the final operands are converted. Ordered price MA/ATR recurrence must
match the approved ordered binary64 calculation; a NUMERIC sum with a final
cast is a different calculation.

No Cloud PostgreSQL, migration, native retry or connection is authorized here.
PostgreSQL/PostgREST execution is **NOT_RUN / native HOLD**. The commands below
are for a separately authorized isolated coordinator environment only, using
that environment's existing approved connection context. Do not use production
credentials or apply any schema to run this arithmetic witness.

From the repository root, in that isolated environment:

```sh
psql -X -qAt -v ON_ERROR_STOP=1 -v vector=negative_excess \
  -f web/scripts/launch-ranking-binary64-vectors.sql > /approved/private/wire-negative.pg.json
node --no-warnings --experimental-strip-types web/scripts/launch-ranking-wire-replay.mjs \
  --run 00000000-0000-4000-8000-000000000001 --symbol 5274 \
  --read-at 2026-11-14T00:00:00Z < /approved/private/wire-negative.pg.json
```

The SQL contains only a session-local float serialization setting and a SELECT;
it does not read research tables or create functions. Select each of these
labels separately to generate one full 16-rule packet per artifact:

`negative_excess`, `positive_excess`, `positive_tiny`, `negative_tiny`,
`known_zero`, `depth_below`, `depth_exact`, `depth_above`, `distance_exact`,
`distance_above`, `ratio_exact`, `ratio_above`, `signed_ratio`, `positive_third`, `signed_third`,
`integer_cancellation`, `equal_rs63_tie`.

All these packets are synthetic arithmetic witnesses with `entryEligible:false`
and no current qualification. Their synthetic IDs/research are not evidence of
a published ranking, a source producer, rights, calendar completeness or review.
The negative excess case must preserve `0.1::float8 - 0.3::float8`, not replace
it with decimal `-0.2`. The integer cancellation case must preserve exact
`MAX_SAFE + 2 - MAX_SAFE = 2` before float division.
The two third cases use exact signed nets `1` and `-1`, volume `3`, and
`float8` division before JSON serialization; their foreign-five-day rule awards
five and zero points respectively, without rounding the repeating ratio.
`equal_rs63_tie` emits two members with equal overall/technical scores and
binary64 RS63. Reverse input rows `5275`, `5274` are aggregated with explicit
overall/technical/float8-RS63 descending and symbol ascending SQL `ORDER BY`,
producing `5274`, `5275` with separate immutable IDs and
matching revision refs. Its selected `5274` detail retains all16 rules. Use the
same consumer command with `--symbol 5274`; its safe receipt reports two members.
For an explicit rejection witness, an independently retained copy may swap the
two members and restore ranks1/2: the parser must reject that tampered tie order.
Record that copy as tampered input, separately from the original PG bytes.

For an independently authorized, installed PostgREST reader, capture its raw
response body for the fixed RPC `vnext_launch_ranking_read_v1` with exactly:

```json
{"p_ranking_run_id":"<existing immutable UUID>","p_symbol":"5274"}
```

Pass those original bytes to the same consumer with the actual `--run` and
`--symbol`. Omit `--read-at` for a current read: the consumer fixes its time only
after all input bytes arrive. Never regenerate, round, or substitute a fixture
for the response. The consumer accepts no URL, DB connection or execution mode.
Inputs are fatal UTF-8 and at most 2 MiB; errors produce only a generic refusal.

Keep the source commit, PostgreSQL/PostgREST version, actual acquisition clock,
raw byte length/SHA256, exact command and exit status with the independent
receipt. A consumer PASS proves transport/parser consistency only. Actual
selected-cache, source, independent-review, writer/RLS/CAS and release gates
remain separate.

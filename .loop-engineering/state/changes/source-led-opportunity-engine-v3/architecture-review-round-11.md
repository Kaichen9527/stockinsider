# V3.16.21 single independent Architecture review

Date: 2026-08-17
Review authority: the one permitted independent Architecture review for V3.16.21,
performed read-only after the fresh Requirements PASS carrier.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `330973bcd8b06db399d82ceb194b74c3d8e4d521`
- Requirements implementation commit: `3d97bcda5442971b526af42e3e7b71926126922a`
- Requirements evidence carrier: `4f301dd975a9c425a3caa3114dff322dcac0172b`
- Final repair-closure commit/tree: `4f301dd975a9c425a3caa3114dff322dcac0172b` / `cd39dfcec04b4ba00cc43e79f55554a9c7bdeb77`
- Full reviewed implementation range: `330973bcd8b06db399d82ceb194b74c3d8e4d521..4f301dd975a9c425a3caa3114dff322dcac0172b`
- Active graph: `176ae0d91ca1912d7bcb68cc48c0e94a18ab01e47956e55456ef434400bd2ea7`

## Architecture closure

The provider boundary is append-only and race-safe: the request key has a unique
constraint, `INSERT ... ON CONFLICT` serializes contenders, immutable triggers reject
update/delete, and a differing winner is recorded only as redacted hashes in the
conflict ledger. Service role can execute the exact leased RPC but cannot insert into
the tables or execute the wrapped private claim function.

The stage graph captures response bytes before any parser consumes them. Downstream
candidate, fact, analysis and projection work reads a detached, deeply frozen
normalized payload. The final claim injects a sorted provider lineage and advances
the evaluation clock to the latest stored `fetched_at`, so retry determinism and
point-in-time eligibility use the same database evidence. Predecessor projection
health is explicitly non-authoritative.

The Web request path performs only the compact projection read and one bounded
runtime-health read in parallel. The same effective-health function controls public
and authenticated responses. Action envelopes are removed on mismatch even for a
client that ignores health metadata, while last-good cards remain navigable to an
exact revision or a safe research-only view. The research-only view bounds text and
blockers, accepts only HTTPS provenance URLs and introduces no mutating surface.

Migration rollback is additive-object retention plus scheduler stop; runtime and
Vercel retain independent captured rollback targets. The sole launchd owner,
reviewed manifest/tree/hash binding and disabled V3/LINE/dispatch/automatic-trading
boundaries remain unchanged. Requirements PASS is P0=0/P1=0/P2=0, migration is
apply-twice safe, and the implementation test matrix is green. Evaluation remains
honestly blocked for non-fabricated elapsed cohorts and is not promoted by this
Architecture PASS.

The protected traceability repair is architecturally bounded: it adds no runtime,
database, network, public API, or deployment edge. It makes the active amendment
declare the cataloged release version, makes the command inventory equal the actual
closed product suite, and checks current action disposition against the release
phase. Focused repair closure is `3/3` PASS and the active graph is re-sealed above.

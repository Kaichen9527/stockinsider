# V3.16.21 single independent Architecture review

Date: 2026-08-17
Review authority: the one permitted independent Architecture review for V3.16.21,
performed read-only after the fresh Requirements PASS carrier.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `330973bcd8b06db399d82ceb194b74c3d8e4d521`
- Requirements implementation commit: `49edac4bcf471b01ba41a96114929331db62aca3`
- Requirements evidence carrier: `e2a6b3aaca8c314033e98df9faf442e731350042`
- Final repair-closure commit/tree: `e2a6b3aaca8c314033e98df9faf442e731350042` / `ef1163c7b04a8ede908a183e4cfc43316a7a6366`
- Full reviewed implementation range: `330973bcd8b06db399d82ceb194b74c3d8e4d521..e2a6b3aaca8c314033e98df9faf442e731350042`
- Active graph: `377a22989728a8276833a11ae8a29ab669eef40f53a2a7285acdd135798a9c0a`

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

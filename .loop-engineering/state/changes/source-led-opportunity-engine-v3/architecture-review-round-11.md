# V3.16.21 single independent Architecture review

Date: 2026-08-17
Review authority: the one permitted independent Architecture review for V3.16.21,
performed read-only after the fresh Requirements PASS carrier.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `cde4915db22f279a891b478540a2ebdab54876fb`
- Requirements implementation commit: `5add5b8dcd559edadef96b5d6fdc46bb4f89ff22`
- Requirements evidence carrier: `64e29b274bee6e47e2930304cf99656720d3250e`
- Final repair-closure commit/tree: `64e29b274bee6e47e2930304cf99656720d3250e` / `0fb3151300a0f9bc01b6693107503d73b296e75e`
- Full reviewed implementation range: `cde4915db22f279a891b478540a2ebdab54876fb..64e29b274bee6e47e2930304cf99656720d3250e`
- Active graph: `b07516d0b650da847d8e0cba59edf2c25672e88443582a0e696e093a13e80525`

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

The production-cardinality repair changes only the internal SQL execution plan for
official ingestion. One closed chunk shares one immutable acquisition timestamp,
validates the complete authority roster once, and then resolves each of at most
twenty rows through the already indexed private resolver. The public resolver,
wire envelopes, provider acquisition revisions, transaction leases, migration
authority, grants and Web interfaces are unchanged. The new additive migration
guards the predecessor body, applies twice, preserves the private owner and cannot
turn a partial or conflicting roster into action authority.

The release operator and the reviewed apply CLI now consume one ordered migration
chain. The displayed plan cannot omit the roster-chunk snapshot while the mutation
path applies it, because a product regression executes the planner and compares it
exactly with the reviewed chain. This preserves the existing approval boundary:
read-only planning describes the same additive SQL that the exact reviewed CLI may
execute, with no password, credential, public grant, or rollback-policy expansion.

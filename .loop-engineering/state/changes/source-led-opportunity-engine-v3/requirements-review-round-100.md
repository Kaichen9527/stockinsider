# V3.16.21 single fresh Requirements review

Date: 2026-08-17
Review authority: the one permitted fresh Requirements review for the V3.16.21
successor release, performed read-only against the immutable implementation subject.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `cde4915db22f279a891b478540a2ebdab54876fb`
- Final repair-closure commit/tree: `5add5b8dcd559edadef96b5d6fdc46bb4f89ff22` / `558d0d950bd7e5f7521a0c4e5a4deefca28babe2`
- Full reviewed range: `cde4915db22f279a891b478540a2ebdab54876fb..5add5b8dcd559edadef96b5d6fdc46bb4f89ff22`
- Active graph: `b07516d0b650da847d8e0cba59edf2c25672e88443582a0e696e093a13e80525`

## Requirements closure

The implementation satisfies the V3.16.21 frozen-acquisition contract without
reopening the already-passed V3.16.20 gates. Every live provider request is captured
once into an append-only, hash-bound envelope with its real `fetchedAt`; a retry
reuses the completed request key, a conflicting response is quarantined, and the
database prevents service-role table writes outside the exact leased RPC.

The database-owned evaluation clock advances to the latest immutable acquisition
time for the current run. It never rewrites `fetchedAt` or the source cutoff, so a
current analysis can use evidence that actually arrived while a historical cohort
cannot consume evidence fetched in its future. Action authority binds the complete
provider lineage and official coverage, not one mutable fact fetch or a predecessor
projection.

Public Radar and authenticated health use the same checksum, freshness, runtime,
consumer/producer, manifest, migration and acquisition checks. Every mismatch
disables action; checksum-valid research remains visible as read-only and checksum
conflict alone clears it. Legacy V3.12 cards and stale V3.14 cards remain navigable
through a bounded research-only detail whose source link accepts HTTPS only. Missing
authority is shown as a typed blocker rather than `avoid` or a fabricated buy.

The additive migration applies twice on a fresh database and its executable
`appended -> reused -> conflict` lifecycle passes. Product correctness passes
`117/117`, V3.16.21 focused coverage passes `8/8`, migration passes `60/60`,
performance passes `5/5`, typecheck, lint and production build pass, and model-runner
passes `28/28` with disabled host-pin v3.9 doctor PASS. No password reset, credential
rotation, LINE, dispatch, automatic trading or V3 Promotion is introduced.

Protected owner execution exposed one traceability root rather than a product
requirement defect: the new amendment lacked its canonical version header and the
script-value registry still described the predecessor product-correctness command.
The repair adds the canonical declaration, updates and re-hashes the closed command
registry, and binds current-task disposition to the machine-readable release phase.
The three formerly failing structural owners now pass `3/3`; no requirement scope,
authority boundary, public interface, migration behavior, or action rule changed.
Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; this Requirements PASS makes
no claim that future returns are proven.

The production-cardinality successor preserves the reviewed 20-row transaction
bound while moving full instrument-roster validation from every row to once per
single-timestamp chunk. Every row still uses the indexed internal resolver after
the complete roster integrity check. Mixed acquisition timestamps, an unknown
predecessor SQL shape, excess public grants or a changed point-in-time cutoff fail
closed. This closes the forensic four-hour runtime path without weakening source
authority, provenance, lease, retry or pooler requirements.

The operator-visible migration plan now derives the same ordered migration chain
as the reviewed apply command and therefore includes the roster-chunk snapshot
migration. A regression executes the real planner and requires exact parity with
the apply-chain declaration, preventing an operator from approving a displayed
plan that omits code the reviewed CLI will execute. This closes the final P1 found
during read-only release preparation without changing schema authority or runtime
semantics.

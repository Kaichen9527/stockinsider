# Screened candidate publication coverage fix

## Outcome

A high-severity completeness gap was found and repaired. The research cycle already conserved every current screened Taiwan symbol in its per-stock ledger, but the publication reconciliation only inspected cards that existed. A screened-only symbol with no recent source mention could therefore have a completed saved revision yet no public found card, and the publication gate would not identify that absence.

The guarded path now carries the current screened roster into stage projection and publication reconciliation. Each in-authority screened symbol must have at least one exact same-run card with the saved revision ID and compact trade-plan summary. Missing, invalid, duplicate, out-of-roster, stale-revision, and summary-drift cases all fail closed.

## Code changes

- `loadCandidateStageCards` accepts a bounded, unique four-digit required roster and includes its saved stage snapshots even without a recent mention.
- `reconcilePublishedCandidateTradePlanCoverage` distinguishes optional research candidates from required current-screen candidates and reports required-card counts.
- `runPipelineFlow` freezes the current screen before stage projection, excludes only symbols outside the cutoff official common-stock master, and supplies the remainder to both projection and reconciliation.
- Two regression tests prove that a missing required card blocks publication and that invalid, duplicate, or non-research required symbols cannot be normalized away.

## Verification

- Candidate trade-plan coverage tests: 17 passed, 0 failed.
- TypeScript check: passed.
- Next production build: passed, 91 pages generated.

## Boundaries

This is a code-path repair, not a production completeness claim. No production database was read or written, no guarded pipeline was run, and no article was published. The existing 40 blocked previews remain unchanged; the authoritative complete candidate snapshot and the other previously advertised candidates are still unavailable. Deployment must later prove that required screened count equals matched required card count, with zero missing or mismatched cards.

# StockInsider V3.14 — Fresh Requirements Gate Round 131

## Subject identity

- Subject commit: `2aefcf2fdb81f8a751f90bd3626192c6fd6cc113`
- Subject tree: `29532559faafd3154af743c592a6c68e943e03eb`
- Direct parent: `0f72b3bba229b4d3d1df0dc738bcad348492a07f`
- Initial worktree/index: clean

## Verdict

`CHANGES_REQUIRED P0=0 P1=4 P2=0`

The subject is not eligible for Architecture Gate or release-candidate status.

## Findings

1. **P1 — completion bypasses the V3.13 authoritative successor contract.**
   `complete_legacy_producer_job_v3_14` sends V3.14 facts-refresh results directly
   to the pre-V3.13 renamed completion function. That skips the V3.13
   decision-integrity persistence and successor checks. Non-facts stages use the
   V3.13 wrapper, so the pipeline has two incompatible completion authorities.
2. **P1 — official authority rows are written before terminal conservation.**
   Each non-terminal chunk immediately calls the official append functions. An
   interrupted or invalid terminal can therefore leave a partially applied
   backfill. The chunk ledger stores only a hash/count, so completion cannot first
   validate a closed manifest and then atomically apply its exact payload.
3. **P1 — MOPS consolidated-fact authority is not closed.**
   `parseContexts` accepts contexts containing segment/scenario dimensions. Equal
   concept/period rows are later collapsed by lexical source reference, which can
   select a segment member rather than the consolidated issuer fact and corrupt a
   valuation bridge.
4. **P1 — acquisition bounds are not closed over the actual request graph.**
   The live annual calendar can exceed the 260-row corporate-action input bound,
   while the function only consumes the latest 130 sessions per exchange.
   Separately, user-supplied and calendar-derived valuation sessions are bounded
   before union rather than after union, allowing the combined request set to
   exceed its declared 504-request authority.

## Required closure

- Stage immutable chunk payloads; validate a unique, bounded terminal manifest;
  apply staged official rows and complete the job in one transaction.
- Preserve the current V3.13 completion wrapper for every stage, extending its
  schema acceptance without bypassing its persistence logic.
- Reject dimensional MOPS contexts and add a consolidated-versus-segment
  regression.
- Bound the effective corporate-action and valuation request sets after
  normalization/union and test the live-size calendar shape.
- Create a new immutable commit/tree and obtain a new independent fresh
  Requirements verdict.

## Scope

This was an independent, read-only Requirements review of the exact subject. It
did not modify production, run migrations, activate the producer, deploy Web, or
grant Promotion authority.

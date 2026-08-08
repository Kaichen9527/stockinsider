# Fresh Requirements Gate Review — Round 101 Production Completion

Date: 2026-08-08
Reviewer: Codex independent gate review
Review mode: read-only final revalidation of the immutable production-completion subject
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `2a15fcff2172101f2c75fc0a88d3ec82f13d1fb1`
- Final repair-closure commit/tree: `e3d4269383dc545985359fb1352ef63e0eb6cf8a` / `c75d1cf51a2ddfe5be7fe24a0eb01c3400f0a793`
- Full reviewed range: `2a15fcff2172101f2c75fc0a88d3ec82f13d1fb1..e3d4269383dc545985359fb1352ef63e0eb6cf8a`
- Active contract graph: `bd557c0f27263dbca17610ec07469ac73835838e5cc3d6d5fe921891c82de435`
- Acceptance inventory: `1.44.6`, 297 cases, 31 immutable PCR boundaries

The subject was resolved from immutable Git objects. The working tree was clean,
`git diff --check` passed, no environment products or credentials were tracked, and
the new production-completion record is explicitly non-normative. The closed active
contract/version graph and its 297-case acceptance inventory are unchanged.

## Findings discovered and closed in this round

1. A durable health observation from the previous producer could have supplied old
   manifest PASS fields while the route overlaid a newer run identity. The final tree
   requires exact commit, worker and scheduler-config equality before an observation
   is usable; a mismatch enters the fail-closed direct-run fallback.
2. The bootstrap originally held only a phase-one transaction advisory lock and did
   not explicitly roll back every apply-mode phase-one failure. The final tree holds a
   session advisory lock across every bounded document batch, tracks transaction state,
   rolls back all open transactions and releases the session lock on every exit.
3. Read-only production audit found 55 legacy records whose publication timestamp was
   later than collection. They are now counted as `rejectedInvalidTimestamp` and
   excluded rather than backdated or admitted as point-in-time evidence.
4. Existing transitive production advisories (`undici` and `nanoid`) and broad dynamic
   Next output tracing were closed. Root and Web production dependency audits now have
   zero findings, and production build has zero unexpected NFT-file warnings.

## Requirement closure

- Official TWSE and TPEx company rosters produce 1,977 unique four-digit listed/common
  instruments, above the 1,700 fail-closed floor. The fixed seed does not populate the
  production authority plane.
- The bootstrap requires a clean reviewed commit, direct-child attestation, owner-only
  canonical HMAC authority, exact mutation, 15-minute lifetime and non-replay nonce.
- Production rehearsal imported 1,977 instruments, 3,749 official aliases, 1,977 sector
  assignments, 32 source identities and 20 source revisions inside one transaction,
  then rolled it back. Independent post-rehearsal counts remained zero.
- Full source preparation selected 3,189 revisions: 3,134 hash-valid documents, 55
  typed timestamp rejections and zero overflow. No synthetic document was generated.
- Material authority recorded after the ordinary weekday cutoff creates exactly one
  stable whole-second refresh occurrence. Authority reads enforce source, approval,
  record and validity cutoffs.
- Runtime health is append-only, canonical/hash-bound, immutable and readable only by
  the authenticated service path. Activation fails and rolls back if durable health
  publication fails.
- Missing financial, valuation or technical authority remains `source_signal` or
  `valuation_review`; it cannot create EPS, a target price or a buy-like action.
- `/api/opportunity-v3` remains the exact disabled 404 until the separate Shadow and
  Promotion gates authorize a different mode.

## Fresh evidence

| Evidence | Result |
|---|---|
| TypeScript and ESLint | PASS |
| Production Next build | PASS; zero unexpected NFT-file warnings |
| Core product/public schema | PASS `61/61` |
| Product-correctness PCR | PASS `31/31` |
| PostgreSQL migration/reapply/integration | PASS `27/27` |
| Official roster fetch/normalization | PASS `1,977` |
| Production bootstrap rollback rehearsal | PASS; all post-counts zero |
| Full legacy source prepare audit | PASS `3,134`, typed reject `55` |
| Root/Web production dependency audit | PASS `0/0` findings |

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`: 120 point-in-time backtest dates,
20 real elapsed live dates and the 252-attempt roster cannot be manufactured. This is
not a Requirements defect and blocks Promotion, not reviewed authority bootstrap or
non-influencing shadow evidence collection.

## Decision

`PASS P0=0 P1=0 P2=0`.

The production-completion requirements are complete for the immutable subject. The
next and only design checkpoint is a fresh Architecture Round 12 over the evidence-
carrying tree; no additional Requirements round is required unless that tree changes
normative or executable behavior.

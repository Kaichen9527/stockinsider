# Exact implementation review — production source window and Shadow cohort split

Date: 2026-09-07

Review authority: independent read-only review of the complete immutable diff,
production source-window semantics, Shadow manifest immutability, point-in-time
cutoffs, candidate-universe construction, and regression coverage.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `373683b4aeec397c82a261516ffb1dfa0f7a00e1` / `94aead68061c57cd9fba8eb767044de2df43bb92`
- Full final range: `2ca8acec78dd4e48ebda5bc8e19992e3e598d7e3..373683b4aeec397c82a261516ffb1dfa0f7a00e1`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`

## Review result

- Production candidate research now reads eligible source mentions through the
  run's immutable `evaluatedAt` boundary. A weekend or post-close mention can
  therefore enter the production `found` universe and receive a company detail
  revision without waiting for the next exchange close.
- The Shadow cohort remains independently frozen at the official session's
  18:30 Asia/Taipei cutoff. Its candidate symbols and source-mention revision
  hash are derived only from source rows available by that cutoff, plus the
  pre-existing waiting/actionable and persistent research seed population.
- Future-dated rows are excluded from both windows. Late production candidates
  cannot mutate the manifest candidate list or its canonical source hash, and
  the immutable-manifest upsert behavior is unchanged.
- The change does not alter valuation gates, confidence thresholds, technical
  rules, stage promotion, public source eligibility, database schema, writer
  authority, or scheduler ownership.
- Regression coverage proves that a pre-close mention belongs to both windows,
  a weekend mention belongs only to production, and a future mention belongs to
  neither. Static contract assertions bind the production query, Shadow hash,
  Shadow universe, and production research universe to distinct variables.
- Candidate/Shadow verification passed 136 TypeScript tests and 30 migration and
  schedule contract tests. Source ranking and classification verification passed
  77 tests. TypeScript and the 72-route production build passed; ESLint reported
  zero errors and 33 pre-existing warnings.

## Closure

Independent exact-diff review found no P0, P1, or P2 release blocker. The change
is safe to merge and deploy only after the protected product/runtime gate accepts
this exact subject commit and evidence child.

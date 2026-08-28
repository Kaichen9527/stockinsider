# V3.20 exact-commit repair closure review — five-source completion cardinality

Date: 2026-08-29

Review authority: exact-range closure review after the first reviewed V3.20
runtime catch-up recorded durable `data_integrity_failure` at `source_sync`.
The review is read-only: no production database password, provider credential,
runtime scheduler, Vercel project, LINE, dispatch, auto-trading, or Promotion
setting was mutated.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `6aaa017618f15a0082efb2cafe8c08b32947be1c`
- Final reviewed repair/tree: `2b2fa1967d6300d2fa0b5358532418097ed8875f` / `6f21501619e2dd036dab79603f4592178b67ffa9`
- Full final range: `6aaa017618f15a0082efb2cafe8c08b32947be1c..2b2fa1967d6300d2fa0b5358532418097ed8875f`
- Active graph: `5f985e391799fd8332df16c2151f75cc95dfb643a087912d92df2845a435016e`

## Root-cause closure

V3.20 correctly expanded approved acquisition to five source keys
(`threads`, `podcast`, `youtube`, `telegram`, and `investanchors`), but the
authoritative completion wrapper retained two historical three-source
cardinality checks. The valid 85 terminal-outcome matrix therefore completed
its persistence loop and was then rejected as `data_integrity_failure`.

The repair is a single additive, transactional migration. It updates only the
two closed count expressions when the frozen acquisition envelope is V3.20,
keeps V3.13's three-source semantics unchanged, and asserts both the exact
five-key matrix and legacy compatibility after replacement. The migration
reasserts this postcondition on a second apply. No official-market, seed,
price-dislocation, or peer-only path can nominate a candidate; the existing
KOL-first authority remains unchanged.

## Executable evidence

- Migration contract and privilege/replay suite: `74/74` PASS, including apply
  twice and the V3.20 five-source/V3.13 three-source boundary.
- Product correctness: `38/38` PASS, including PCR-001 through PCR-031.
- Typecheck, lint, production build and `git diff --check`: PASS.
- The exact repair range `88b7300c7349666d4572e77847b013042b6648a9..2b2fa1967d6300d2fa0b5358532418097ed8875f`
  has no P0/P1/P2 finding. The full final range is closed by this review.

Requirements and Architecture evidence is reused only because this repair
does not change any active Loop artifact; its immutable active graph remains
identical. The evidence ancestry bridge is fast-forward-only and does not use
a bypass or force push.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`.

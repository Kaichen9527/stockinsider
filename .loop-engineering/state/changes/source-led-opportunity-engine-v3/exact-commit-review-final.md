# Exact commit review: official TPEx calendar fallback

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `40f030466b159dffce8556196dd40b86f16943aa..51649140c05f65140235bb7a0532ec986c2545f4` and reviewed tree `568e77c6adfe55e8a6082429bf26cae86cf9a8c6`.
- Official trading-session recovery when TWSE FMTQIK old-month archives return CDN security-block HTML to the production VPS.
- TPEx monthly index response validation, terminal status handling, official close evidence, host pacing, and circuit isolation.
- Existing 1,320-session persistence, 520-session market-evidence threshold, valuation fail-closed rules, and Shadow v2 behavior.

## Findings

- No P0/P1/P2 findings remain. The fallback reads the official TPEx monthly index endpoint and accepts only `stat=ok` rows with ISO-shaped dates and numeric closing values.
- TWSE remains the primary authority. TPEx is queried only for months with no usable TWSE calendar rows, and the union is deduplicated and sorted before the existing requested-session cutoff.
- The production VPS independently returned 1,503 official sessions for the 75-month window, from 2020-07-01 through 2026-09-01. No weekdays, holidays, prices, or sessions are synthesized.
- The change adds no database write, auth path, scheduler, model rule, scoring threshold, or user-visible classification behavior.

## Verification

- Product correctness acceptance cases: 150/150 passed.
- Candidate, market-evidence, valuation, source-policy, stage, risk-action, and Shadow tests: 45/45 passed.
- Deployment, migration, scheduler, publication, writer-fence, and Shadow contracts: 17/17 passed.
- Focused official-market regression tests: 16/16 passed.
- TypeScript, ESLint, diff check, and production Next.js build: passed.

## Evidence

- Final reviewed repair/tree: `51649140c05f65140235bb7a0532ec986c2545f4` / `568e77c6adfe55e8a6082429bf26cae86cf9a8c6`
- Full final range: `40f030466b159dffce8556196dd40b86f16943aa..51649140c05f65140235bb7a0532ec986c2545f4`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`

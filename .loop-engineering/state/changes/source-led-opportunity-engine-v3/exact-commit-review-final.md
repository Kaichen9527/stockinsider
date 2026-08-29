# V3.20 exact implementation diff review — KOL retention closure

Date: 2026-08-30

Review authority: read-only examination of the complete immutable V3.20.1
repair range and its production-bound test evidence. This review did not mutate
production data, runtime, scheduler, Vercel, source providers, LINE, dispatch,
automatic trading, Promotion, or evaluation governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `4aff9de69872819840577c2ecfe3e7405de3b26d` / `02623d31139e9e2afb384b1f6e05e7b1b9880310`
- Repair range: `7f461e74dc7d786a455106e20551df13d2c9131f..4aff9de69872819840577c2ecfe3e7405de3b26d`
- Full final range: `7f461e74dc7d786a455106e20551df13d2c9131f..4aff9de69872819840577c2ecfe3e7405de3b26d`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The complete repair range passes `git diff --check`.
- The retention bridge may recover only a prior immutable InvestAnchors ledger
  whose document and active, time-valid source-identity authority agree at the
  current cutoff. It grants the narrow structured-claim marker only after this
  database revalidation; it cannot revive market-factor, seed, peer, price, or
  unverified legacy candidates.
- A non-empty historical ledger is selected by exact prior run, stock, source
  document, and source identity. It remains bounded to 60 candidates and uses
  the existing 20-session retention contract. Empty runs no longer erase that
  verified research signal, while live Threads, Podcast, YouTube, and Telegram
  material must still be newly acquired through their authorized connectors.
- The security-definer helper has a closed empty search path, is private to the
  wrapper, and leaves runtime/service access only on the existing public claim
  RPC. Its delegation verifier follows the full successor chain rather than
  weakening doctor validation.
- The repair also updates both independent, exact migration-chain assertions.
  This prevents a new reviewed additive migration from being installed by the
  runtime while being silently omitted from product or operator verification.
- The reviewed tree passes typecheck, lint, production build, 63/63 core tests,
  150/150 product-correctness tests including 31/31 PCR cases, 75/75 migration
  tests with double apply, 2/2 legacy regressions, 9/9 Playwright tests, and
  5/5 projection-performance tests.
- The output remains research-only until real official facts, valuation,
  technical authority, and runtime health are present; the repair does not
  fabricate a target price or buy recommendation.

## Closure

No P0, P1, or P2 finding remains. The reviewed tree is ready for the normal
protected Code Gate, then the additive migration, runtime runs, and read-only
production smoke.

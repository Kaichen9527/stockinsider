# Exact implementation review — official candidate data persistence

Date: 2026-08-31

Review authority: read-only review of the complete immutable diff, official
company-name persistence, duplicate official-valuation normalization,
fail-closed candidate behavior, regression tests, and the unchanged
product/runtime graph.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `6a21149c6e614ad5e22057999abfcf52eea1095a` / `5eda2b32e4b9d49276e91ea94aa57e56cd4d228a`
- Full final range: `5f1c54607805458a627d73da5a8787df68530d55..6a21149c6e614ad5e22057999abfcf52eea1095a`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- Source-created placeholder names now retain the original stored database
  value alongside the official roster value. The candidate cycle compares the
  roster name against the stored value and persists the official name before
  the price-history gate, including when official history is unavailable.
- The official TWSE/TPEx roster remains the sole naming authority. No social,
  broker, alias, or unverified source can create or overwrite a company name.
- Official valuation history is deduplicated by official session before the
  bulk upsert. An overlapping cache/live monthly point therefore cannot make
  PostgreSQL update the same `(stock_id, as_of_date)` record twice.
- Missing price history, missing valuation inputs, stale market data, and all
  stage hard gates remain fail-closed. This patch introduces no target-price
  fabrication, threshold relaxation, or promotion bypass.
- The change has no migration, credential, source-policy, scheduler, public
  RPC, or product/runtime graph impact. It preserves the real 30-session
  shadow requirement and keeps Threads outside this scheduler and SLA.
- Candidate/shadow tests, TypeScript, lint with zero errors, production build,
  and diff hygiene passed on the exact subject. The protected product/runtime
  track remains responsible for complete graph verification.

## Closure

No P0, P1, or P2 code finding remains. The subject is ready for protected
checks, rebase merge, atomic VPS release, and a controlled research cycle.

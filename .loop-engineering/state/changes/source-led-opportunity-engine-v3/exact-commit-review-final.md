# Exact implementation review — signed host-pin v3.17 approval

Date: 2026-09-12

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `5f14ab71114f7c89fc8891c5435d2c993cff6d9c` / `b46eccb67455ef91e249622121991f461dec0ca7`
- Full final range: `7a954378efbdad536007f39975e4ffefe346b7e4..5f14ab71114f7c89fc8891c5435d2c993cff6d9c`
- Active graph: `10ddc6020b010a557f2ad000e11df7ebb2413432bb63351d3a4a5bdba26c46bf`

## Review result

- Reviewed the complete two-file change. It does not modify the model runner, host-pin fixture, product runtime, acceptance inventory, workflow or protected aggregate.
- The protected-base successor table authorizes exactly one transition from the already protected v3.16 model-oracle listing digest to the independently measured v3.17 listing digest. It cannot approve an arbitrary second successor.
- The v3.17 listing is bound to one exact host-pin ID and the new active graph is bound to immutable direct-child Requirements and Architecture refs. Candidate bytes cannot select or rewrite those refs.
- The added contract tests exercise the actual closed transition, reject unrelated listings, and preserve fail-closed behavior for missing approval, missing host pin and listing mismatch.
- The current protected model-oracle listing remains byte-identical to the protected base, so this approval commit uses the existing signed artifact. It does not claim that the v3.17 candidate itself has run until the successor PR is separately reviewed and executed.
- Local protected-worker verification passed 15/15, including filesystem/network isolation and the exact closed review path checks.
- No branch protection, required check, exact-review requirement, runner isolation or signed-host verification is disabled or bypassed.
- No unresolved P0, P1 or P2 finding remains.

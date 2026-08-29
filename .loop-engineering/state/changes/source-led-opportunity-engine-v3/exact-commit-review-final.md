# V3.20 exact repair diff review — runtime disk recovery floor

Date: 2026-08-30

Review authority: independent, read-only review of the bounded runtime recovery
repair. It records no production database, runtime, scheduler, Vercel, source,
LINE, dispatch, automatic-trading, Promotion, or evaluation-governance change.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `7d40710da509a08f9fff737b9f0df3ccc253645b` / `bd6e3486c650785fb37c8ea5680a3f52d5fef913`
- Focused repair range: `f72ee1ada533e175b4a81081ed4e5a383619cb7d..7d40710da509a08f9fff737b9f0df3ccc253645b`
- Full final range: `7f461e74dc7d786a455106e20551df13d2c9131f..7d40710da509a08f9fff737b9f0df3ccc253645b`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The repair changes only the reviewed retention policy and its contract
  regression. It restores the documented 30 GiB hard floor and retains a
  32 GiB warning threshold; it does not weaken the disk-capacity fail-closed
  invariant below that floor.
- This is the narrow root cause of the prior bootstrap rollback: the host had
  roughly 31 GiB free, which met the V3.19 release plan but was blocked by an
  undocumented 32 GiB hard floor. The repaired policy reports that range as a
  warning rather than a false release failure.
- The exact tree passed the V3.19 reconciliation contract, the complete
  migration contract, `git diff --check`, and 150/150 product-correctness
  cases (log SHA-256:
  `800377387086b2a40f44bb316ba8d2a8c3db56ae31286b16f2af60e337803d7c`).

## Closure

No P0, P1, or P2 finding remains. The normal protected Code Gate remains the
authority for merge eligibility. This repair does not authorize fabricated
investment action, full-market nomination, credential rotation, LINE,
dispatch, automatic trading, Promotion, or a change to the blocked,
non-fabricated evaluation-governance state.

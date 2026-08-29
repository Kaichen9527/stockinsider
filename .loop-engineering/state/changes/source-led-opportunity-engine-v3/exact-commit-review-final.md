# V3.20 exact implementation diff review — mutually exclusive marker repair

Date: 2026-08-29

Review authority: read-only examination of the repair range and complete
immutable V3.20 range. The review did not mutate production data, runtime,
scheduler, Vercel, source providers, LINE, dispatch, automatic trading,
Promotion, or evaluation governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `3520da3f47795d092d51e0fbe1b7252a9a7b4694` / `450556a6e96bc783243af1ad93ba848ec1e57f8f`
- Repair range: `591c1ff46ae88f7d669918c00294e9ad5a245e24..3520da3f47795d092d51e0fbe1b7252a9a7b4694`
- Full final range: `1c4f3c786032be3e3f70aac7751615f6f74561a8..3520da3f47795d092d51e0fbe1b7252a9a7b4694`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- Both ranges pass `git diff --check`; the repair changes only the marker
  migration and its contract test.
- The prior prefix grammar overlapped the deployed coalesced counter and
  therefore counted a single authoritative predecessor twice. The repair
  replaces it with mutually exclusive plain and coalesced forms, while keeping
  the pre-existing `priorProjections` form closed.
- A read-only inspection of the exact production function produced
  `with_prior=0`, `bare_plain=0`, and `bare_coalesced=1`; the new grammar
  therefore selects exactly one authorized replacement.
- The migration contract suite passes. The regression forbids the prefix-only
  form and proves the deployed coalesced predecessor selects exactly one form.
- KOL-first nomination, exact reaper identity, runtime lease authority,
  disabled-action safety, and all non-migration release behavior are unchanged.
- This evidence does not itself authorize activation. Release still requires
  normal protected checks, the reviewed additive migration, runtime, Vercel,
  and smoke gates.

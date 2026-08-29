# V3.20 exact implementation diff review — deployed-wrapper marker closure

Date: 2026-08-29

Review authority: read-only examination of the repair range, the complete
immutable V3.20 range, and the deployed PostgreSQL wrapper grammar. The review
did not mutate production data, runtime, scheduler, Vercel, source providers,
LINE, dispatch, automatic trading, Promotion, or evaluation governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `0dbc1d85d11a9bd16457a380b42cebfcf2f93b6a` / `a8fee828d7ef412a35078efa1775d90617ce8aca`
- Repair range: `3520da3f47795d092d51e0fbe1b7252a9a7b4694..0dbc1d85d11a9bd16457a380b42cebfcf2f93b6a`
- Full final range: `1c4f3c786032be3e3f70aac7751615f6f74561a8..0dbc1d85d11a9bd16457a380b42cebfcf2f93b6a`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- Both ranges pass `git diff --check`; the repair changes only the additive
  marker migration and its closed contract test.
- The production wrapper contains the authoritative `legacyPayloadHashes` /
  `legacySourceResultHash` pair before its coalesced prior-decision counter.
  The earlier grammar started at the latter key and did not recognize this
  deployed predecessor. The repair binds all three predecessor forms to the
  full pair, so an unrelated `jsonb_build_object` cannot match.
- A read-only inspection of the exact production function produced
  `with_prior=0`, `bare_plain=0`, and `bare_coalesced=1` for the repaired
  grammar. The bare plain and coalesced forms remain mutually exclusive.
- The migration contract suite passes; its regression now uses the actual
  production coalesced predecessor and proves that exactly one closed grammar
  accepts it.
- KOL-first nomination, exact reaper identity, runtime lease authority,
  disabled-action safety, and all non-migration release behavior are unchanged.
- This evidence does not itself authorize activation. Release still requires
  normal protected checks, the reviewed additive migration, runtime, Vercel,
  and smoke gates.

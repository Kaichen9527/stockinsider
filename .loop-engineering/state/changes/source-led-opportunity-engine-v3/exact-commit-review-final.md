# V3.20 exact implementation diff review — closed canonical marker repair

Date: 2026-08-29

Review authority: read-only examination of the repair range, the complete
immutable V3.20 range, and the deployed PostgreSQL wrapper grammar. The review
did not mutate production data, runtime, scheduler, Vercel, source providers,
LINE, dispatch, automatic trading, Promotion, or evaluation governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `18bed007486a81db4a4c1a7ee144d0b6c5b7a88f` / `4c590766ab0ad759a3628774435f04adcd8df312`
- Repair range: `0dbc1d85d11a9bd16457a380b42cebfcf2f93b6a..18bed007486a81db4a4c1a7ee144d0b6c5b7a88f`
- Full final range: `1c4f3c786032be3e3f70aac7751615f6f74561a8..18bed007486a81db4a4c1a7ee144d0b6c5b7a88f`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- Both ranges pass `git diff --check`; the repair changes only the additive
  marker migration and its closed contract test.
- The production wrapper contains the authoritative `legacyPayloadHashes` /
  `legacySourceResultHash` pair immediately before its coalesced prior-decision
  counter. A read-only preflight against that deployed function selected
  exactly one closed predecessor and returned successfully.
- The migration recognizes four mutually exclusive, complete canonical
  fragments: compact prior-projections, original pretty prior-projections,
  compact bare/plain, and compact bare/coalesced. It uses `length`/`replace`,
  never a PostgreSQL regular expression, so an unknown form cannot be
  rewritten.
- The migration contract suite passes both applications against the original
  pretty prior-projection fixture, while the production preflight proves the
  compact coalesced predecessor. Postconditions require exactly two marker
  keys, one JSON accessor, and no remaining predecessor literal.
- KOL-first nomination, exact reaper identity, runtime lease authority,
  disabled-action safety, and all non-migration release behavior are unchanged.
- This evidence does not itself authorize activation. Release still requires
  normal protected checks, the reviewed additive migration, runtime, Vercel,
  and smoke gates.

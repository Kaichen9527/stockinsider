# Exact implementation review — Taiwan data and valuation daily pipeline

Date: 2026-09-06

Review authority: independent read-only review of the complete immutable diff,
provider trust boundaries, Taiwan market and financial normalization, valuation
fail-closed behavior, publication/replay semantics, VPS scheduling, public source
rendering, migrations, and the complete regression suite.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `605b6bca2c5777893f5e03b2bcc27d49ee1f4c65` / `707218c14cf9f25b66ca9e40daa9e00ac7c50866`
- Full final range: `cf9d65786429cc3e5b3ce61bbd07705ac860b463..605b6bca2c5777893f5e03b2bcc27d49ee1f4c65`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`

## Review result

- Official TWSE, TPEx, MOPS and company IR inputs remain primary. The FinMind
  adapter is a host-pinned, size-capped, opt-in gap source whose identity and
  conflicts remain visible; it cannot silently become independent official
  evidence or support promotion when validation disagrees.
- Market date, schema, pagination, shares/lots, price, PE/PB/yield, quarter/YTD,
  instant/duration, basic/diluted EPS and availability semantics fail closed.
- Daily queue and publication writes require exact internal authentication and
  the active VPS writer lease. Public URLs reject private and mapped-private
  targets and strip credential-like query parameters.
- Forward, normalized-cycle, PB/ROE, EV/EBITDA and turnaround routes require
  their documented evidence. Missing or conflicting inputs cannot create an
  invented target price, waiting promotion, or actionable authority.
- Preliminary and final publication identities are distinct. Only a complete
  final projection can advance confirmation or Shadow; immutable replay remains
  bound to the frozen final inputs.
- Public dossier text uses revision-bound, human-readable citations and does not
  expose internal UUIDs. Paid/reference-only material is excluded from claims.
- The VPS schedules are the sole production writer schedules and use one lock;
  GitHub workflows remain manual recovery paths.
- Product correctness passed 150/150, migration/PostgreSQL contracts passed
  78/78, all other source, Shadow, regression and Arelle suites passed, and
  TypeScript, lint and the production build passed.

## Closure

Independent exact-diff and security reviews found no remaining P0, P1 or P2
release blocker. The subject is safe to merge and deploy with the additive
migration and the documented fail-closed external authorization gates.

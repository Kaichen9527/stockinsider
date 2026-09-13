# Exact implementation review — unavailable exchange multiple normalization

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `1befd213449e515ac39b203d3f02392648eaf675` / `1a18d5750efbdc6d011f52c17800bf50d271ac21`
- Full final range: `0dd35226c2691407a0f2f5e4a72948a17c6e4f10..1befd213449e515ac39b203d3f02392648eaf675`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed the provider implementation and regression tests against the protected base. A rollback-only production transaction reproduced the blocking database error exactly: TWSE's `-` unavailable-PE marker reached a numeric cast and aborted all 1,080 official valuation rows.
- The repair normalizes only syntactically valid finite numeric strings after removing display commas. Exchange absence markers become JSON null at the typed provider boundary; valid zero, positive and negative numeric text remains representable.
- Both the named TWSE fields and their durable positional values are normalized, preventing the persistence fallback from reintroducing the dash. TPEx object rows use the same rule.
- A missing PE does not discard an independently valid PB, and vice versa. Rows with neither multiple remain excluded rather than producing invented values.
- Targeted provider tests passed 17/17, including independent TWSE and TPEx unavailable-multiple fixtures. TypeScript, lint with zero errors, and the full production build passed.
- No source authority, credential, scheduler, database role, classification threshold or write-lease boundary changed. No unresolved P0, P1 or P2 finding remains.

## Production boundary

This review authorizes only the unavailable official multiple normalization after protected checks pass and the pull request is merged normally. Ruleset `20177392` remains enabled.

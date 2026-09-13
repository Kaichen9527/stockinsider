# Exact implementation review — Taiwan official market endpoint repair

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `7cbd6e341b570cd85353b70c150096db338818f6` / `d19c808dce1a04ce250e0494f13d3fcb0d898b81`
- Full final range: `bb572502d00d5d0e6ace378ef470f2f5aae0f785..7cbd6e341b570cd85353b70c150096db338818f6`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed both changed files against the current protected base. The four final-market jobs were blocked by retired or production-inaccessible endpoint identities: legacy TWSE routes were intercepted by the exchange edge, and the old TPEx valuation/index routes returned 404.
- TWSE price, valuation, institutional and margin datasets now use canonical `rwd/zh` routes. The TAIEX close uses the bounded official monthly history route that was proven reachable from Contabo. TPEx exchange-wide valuation and index datasets use current official OpenAPI endpoints.
- Top-level TPEx arrays remain bounded by the existing two-megabyte response limit, are stored as object-shaped durable attempts, and are promoted only after the requested official trading date and required fields are present.
- Compact ROC and Gregorian dates are normalized explicitly. Monthly responses retain only the requested trading session; another session is rejected rather than relabelled. FinMind remains a separately identified fallback and is never presented as official exchange evidence.
- Targeted provider tests passed 16/16; merged-base backup/ledger contract tests passed 6/6; TypeScript, lint with zero errors, and the complete production build passed.
- Live 2026-09-11 official smoke returned one canonical TWSE index record, 1,080 TWSE valuation rows, one TPEx index record and 885 TPEx valuation rows. All four returned HTTP 200 and the expected trading session; the TWSE index route was independently verified from the production VPS.
- No write authorization, credential destination, database schema, source policy or scheduler boundary changed. No unresolved P0, P1 or P2 finding remains.

## Production boundary

This review authorizes only the Taiwan official market endpoint repair after all protected checks pass and the pull request is merged normally. Ruleset `20177392` remains enabled.

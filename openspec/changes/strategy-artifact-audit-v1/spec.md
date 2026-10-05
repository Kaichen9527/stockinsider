# Offline retained strategy artifact audit

## Approved scope

Independently audit the retained PR284 development artifact under
`research/tw-strategy-lab/results/github-36081668572-1`. Do not import the engine's
metric helper or execute code delivered inside an artifact. No network, new
simulation, normalized/holdout data access, submission, model, database, schema,
production operation or strategy adoption belongs to this change.

## Behavior

- Pin the existing 24-file inventory, dataset, registry and original run/source
  identities. Missing, changed, unbounded or symlinked files fail closed. Never
  alter prior receipts, data, code hashes or experiment expectations.
- Independently recompute all 15 strategy/scenario exported curves and fill-based
  commission/tax/notional statistics. Validate recorded chronology, signal/fill
  association and retained terminal holdings. Record discrepancies, not repairs.
- Preserve the eight-symbol original denominator, three exclusions, S5/S7 blocked,
  S4 zero-trade paths and negative outcomes. This fixed survivor sample remains
  exploratory; successful arithmetic is not market or investment verification.
- Explicitly mark actual fills, slippage, prices/dividends, official-action replay,
  historical PIT, broad universe, research/KOL arms and holdout/forward evidence
  unavailable. Retained exports cannot establish these claims.
- Return a completed/partial audit distinct from failed investment validation.
  Always set promotion and holdout/forward false and block submission for absent
  compatible legacy experiment parents. Exit 0 means the limited audit completed
  without discrepancies; admission/arithmetic discrepancies return 2.
- Save a new mode-0700 output directory containing exclusive mode-0600 JSON report
  and receipt. Bind report bytes and auditor code hash; refuse overwriting an
  existing output. The receipt is local evidence, not a protected attestation.

## Acceptance

Adversarial tests cover pinned-byte tampering, alternate inventory, missing or
symlinked inputs, duplicate/nonfinite JSON, bounds, altered metrics/costs,
chronology and holdings. Run the actual retained artifact and preserve its real
findings separately from synthetic test evidence. No profitable-strategy claim.

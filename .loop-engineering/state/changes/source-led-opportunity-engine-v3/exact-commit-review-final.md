# V3.20 exact-commit diff review and repair closure

Date: 2026-08-28

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable scope

- Reviewed base: `6aaa017618f15a0082efb2cafe8c08b32947be1c`
- Final reviewed repair/tree: `f0c58c797ce1f410387f9ef06940831cb391b127` / `c838042a92886e6f048969769059ee37f042faf4`
- Full final range: `6aaa017618f15a0082efb2cafe8c08b32947be1c..f0c58c797ce1f410387f9ef06940831cb391b127`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Review result

The exact range is limited to the V3.20 KOL-first successor: expiry-safe
producer recovery, additive SQL reaper and claim-wrapper verification, a
closed five-source nomination authority, five-connector acquisition outcomes,
2605 context protection, compact projection compatibility, and the required
Loop evidence. No public mutating endpoint, table DML grant to the runtime
role, DB-password operation, LINE/dispatch/autotrading/Promotion activation or
evaluation-governance shortcut was introduced.

The review initially found three P1 issues in one root-cause family and they
are all closed in the reviewed range:

1. A lease loss could return without a durable terminal result; it now records
   an allowlisted diagnostic and terminalizes only the exact expired identity.
2. Public Telegram was incorrectly described as a structured-claim source and
   could synthesize a publication time. V3.20 now declares cursor authority,
   preserves a missing source timestamp as missing, and accepts public-channel
   nominations without widening paid-source rights.
3. The final DB claim wrapper did not carry InvestAnchors structured-claim
   authority into the frozen revision. The additive successor wrapper now
   binds `contentAuthorization`, `structuredClaim`, and `rightsAttested`,
   recomputes its canonical hash, and preserves the predecessor boundary.

The closure rechecked the repair range and the complete final range. The
runtime migration rehearse/apply-twice suite, product/runtime PCR suite,
source-led and legacy regressions, performance oracle, typecheck, production
build and protected-gate worker tests all pass. Lint has zero errors and only
the existing 19 warnings. `git diff --check` is clean.

This is an implementation/code-gate review only. Production migration,
terminalizing the actual expired run, runtime installation, Vercel deployment,
two terminal producer runs and Safari smoke remain separately required before
the release can be merged or called deployed.

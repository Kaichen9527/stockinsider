# Exact implementation review — research cycle time budget

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `58a57a5c4bb8b7be66ca690b3201663f92954384` / `2052b8e6581c4b7da442959a3cb76259d75775b0`
- Full final range: `cb8bc853db724f6cb4a2235cfb00f0ec262c08f1..58a57a5c4bb8b7be66ca690b3201663f92954384`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- VPS research-cycle systemd request, pipeline synchronization, and outer process deadlines.
- Internal API sequence parser per-step and aggregate time budgets.
- Failure behavior when an official data provider stalls or the bounded sequence exceeds the unit deadline.

## Production evidence and reasoning

- The 2026-09-13 final Taiwan data scope completed 257/257 with zero failed items before candidate research began.
- The candidate research request hit its 3,600,000 ms synchronization deadline while the Next.js worker remained connected to the official TWSE HTTPS endpoint; VPS retained 20 GiB free and its PostgreSQL and memory state were healthy.
- The repaired 5,400,000 ms pipeline deadline and 5,520,000 ms caller deadline leave a two-minute response margin. Combined with the existing 2,700,000 ms queue-drain maximum, the sequence remains below the unchanged 8,400-second systemd deadline.
- A single request cannot exceed 5,520,000 ms, and the complete sequence cannot exceed 8,300,000 ms, so the repair does not create an unbounded worker.

## Verification

- `node --test scripts/internal-api-sequence-policy.test.mjs scripts/candidate-shadow-performance-contract.test.mjs` — 18 passed, 0 failed.
- `git diff --check cb8bc853db724f6cb4a2235cfb00f0ec262c08f1..58a57a5c4bb8b7be66ca690b3201663f92954384` — passed.
- Manual review of the systemd, inner pipeline, outer caller, lease TTL, and total timeout relationships — passed.

The reviewed commit changes only bounded operational time budgets. It does not weaken source, valuation, publication, writer-identity, or fail-closed research gates.

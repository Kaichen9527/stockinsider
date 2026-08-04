# Requirements Round 89 Repair Candidate

## Scope

This repair candidate addresses all six P1 findings in
`requirements-review-round-89.md`. It is not a Requirements PASS, does not unlock
Architecture Round 10, and performs no PR, deployment, runtime installation, scheduler,
migration or production action.

1. The initial gate trust boundary is now the protected reviewer-owned
   `stockinsider-v3-gate-root` contract. Candidate runners are diagnostic only and an
   absent external envelope fails closed.
2. PCR-001 through PCR-031 now have immutable planned operation/module/export/caller/effect
   records. No unrelated current export, same-file occurrence or nonempty UI file is
   called a semantic owner.
3. The Requirements graph freezes fixtures and planned boundaries, not implementation-test
   bytes. A later green PCR needs exact-commit fulfillment evidence with the real caller
   and full fixture execution.
4. `verify:source-led-opportunity-v3:model-runner` is the fourteenth frozen script row;
   the external envelope validator/writer validates canonical leaf evidence and the exact
   five-input Code aggregate. Omitted, reordered, skipped, cross-tree or tampered inputs
   fail.
5. Doctor now invokes the same `model-runner-v3/hostPreflight.js` verification as the
   runner. The v3.4 fixture records the explicitly re-observed current Codex bundle,
   Codex executable, Node and Git identities.
6. Current task statements now state the canonical `297 / 143 / 148 / 6` registry.

## Required next gate

Run an independent fresh Sol XHigh Requirements Round 90 on the final immutable repair
tree. It must independently verify that the external harness is a real authority rather
than accepting this candidate's contract text, and return `P0=0 P1=0` before Architecture
Round 10 may begin.

## Repair subject and focused verification

Implementation repair subject: commit `6f192ef26d151b652e9dc17f7d16e5ee069518b9`, tree
`ead151e59963c1412d368053936c6bee9dc1e8f8`; its Requirements active graph is
`47615e89d4bf38660f0800e4e60e94a2c7e9c584e392cedeba958deb1838ef1a`.

- `npm run test:source-led-opportunity-v3`: PASS, 52/52.
- `gate-evidence.test.mjs`: PASS, including recomputed skipped evidence, cross-tree
  evidence and omitted model-input mutations.
- focused GOV-004, GOV-001 and HYB-006: PASS.
- `npm run test:model-runner-v3`: PASS, 15/15.
- `npm run v3:doctor -- --expect-mode disabled --require-host-pin
  model-runner-host-pins-v3.4`: PASS, including shared `hostPreflight`.
- PCR declaration baseline for PCR-007: PASS with its planned boundary. Ordinary PCR:
  expected RED, 0/31 PASS and 31/31 `PCR_IMPLEMENTATION_PENDING`; no Code Gate PASS is
  claimed.

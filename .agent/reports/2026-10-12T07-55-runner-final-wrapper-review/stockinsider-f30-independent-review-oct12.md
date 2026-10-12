# Independent review: initial runner trust migration f30

**REQUEST_CHANGES — P0=0, P1=0, P2=2. No PASS evidence refs created.**

Exact subject `f30beda55adc7c11ad42b1f2490e5742651173c9`, tree `36495327684494a2aa8b4798ce3d89615f1d6516`, base `169aad1b6cfa747f78ae3464b614f43c0749d806`. Review used an independent sparse detached worktree populated only from exact Git objects. Maker rolling files were not reviewed or changed.

## Findings

1. **P2 RTM-01 — expired reuse still obstructs fresh live execution** (`scripts/opportunity-v3/protected-external-gate-worker.mjs:1034–1036`). `readModelOracleReuse(false)` postpones expiry validation but the next expression unconditionally reads the historical subject. An expired record with an unavailable old object fails before fresh auth; an expired equal listing enters the reusable path and fails expiry there. Both were independently reproduced by evaluating the exact function with I/O mocks; mocks stop before any auth boundary. The current pinned historical expiry is November15,2026, so this is a demonstrated branch defect, not a claim that today's record has expired. Branch on expiry before looking up the old object. Never accept expired reuse as PASS; preserve the current listing-authority check before fresh execution. Add both counterexamples and unexpired negative reuse checks.

2. **P2 RTM-02 — newly activated live oracle discards uncertain-child resources** (`scripts/model-runner-v3/real-model-attempt.js:51–52`). Unconditional finally removal applies even to an actual `isOwnershipLost`-branded lifecycle error. Independent probe obtained the real brand by simulating leader exit without stdout/stderr EOF at the bounded drain deadline, passed it through the exact oracle caller, and observed recursive removal. The next invocation has no persisted oracle recovery gate. This violates section9 retained-resource/no-auto-retry semantics. Retain the owned resource tree and bounded private recovery identity, report closed recovery_required/IO_ERROR, stop later operations, and block fresh-process retry until trusted recovery confirms quiescence. Test the caller/restart boundary, not only normal executeOperation. No real model process or auth was used in the probe.

## Reviewed boundaries

Reviewed the finite delta from independently reviewed inactive892 plus its prior parser/lifecycle/sandbox review, and the entire main169-to-f30 changed-path inventory (66 paths). Application Web tree, product SQL and external protected workflow remain unchanged. New ordinary evaluation workflow Web dependency installation uses existing locked npm ci --ignore-scripts; it does not change protected authority. Host fixture exact2252 bytes/canonical2251, strict loader/hash identity, current OS-account auth path, operation-only routing, waiver denial, new durable namespace, parser/lifecycle caller binding, old-state rejection and command/inventory mirrors were inspected. No additional P1/P2 found in this bounded pass.

Independently recomputed active graph `ad4e4d1910b320476c09d50736651d705701902d6c1478f9ee65fa3d5ab798dc` and model listing `80703945942d7823cdcaa34972dc7225b96fad83f82befe00d88d81c2648c86a`. Verified new listing maps to v3.25, same new base/subject listing returns protected_base, and old main listing does not authorize this successor. The one-time human tool-PR exception is recorded, but does not represent successful missing technical tests.

Requirements/architecture amendments are finite and keep product ownership/count/partition. The two implementation defects prevent final PASS refs. Also align the retained section9/12 phrase “Inactive ... amendment” with its intended reviewed adoption when repairing, rather than leaving active lifecycle semantics described as inactive. This wording clarification is not a separate security finding.

## Independent execution and honest limits

- Five-file portable/installation suite:106 PASS,0 FAIL,0 SKIP. Includes original worker assertions, candidate boundaries, installation byte/command/inventory parity, parser and lifecycle controls.
- Five selected original caller tests:5 PASS,0 FAIL,0 SKIP. Routing, canonical CLI/waiver rejection, actual synthetic maker lifecycle, direct operation/model rejection, retained old-state rejection.
- Three adversarial scenarios reproduce the two findings; no credentials/provider/real auth reads.
- Initial portable suite89 PASS/1 FAIL was reviewer sparse-checkout omission of the unchanged GitHub action; retained raw. Adding original .github files yielded106/106 without source changes.
- A broader intended filtered original-suite run accidentally included two native host tests:100 PASS/2 FAIL on the nonpinned review Node. Both failed closed in host/doctor checks; no auth/provider was invoked because NO_LIVE_AUTH=1. Its raw is retained and is not represented as host validation. Positive-name-selected caller run is separate.
- Scoped git diff --check passed. No install/build/live model/network credential work. Parent's native host chain and maker's127/14 results are separate evidence, not my execution. New requirements/architecture graph refs and exact protected results remain uncreated pending repair and exact re-review.

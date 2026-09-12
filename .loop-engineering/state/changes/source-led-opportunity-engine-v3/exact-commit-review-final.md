# Exact implementation review — signed host-pin v3.17 closed rotation

Date: 2026-09-12

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `cda1cd87efd411b4575dda10bc811d72a34d7ceb` / `82c0bb48173a53b0b88a7583a8819763107ee452`
- Full final range: `7a954378efbdad536007f39975e4ffefe346b7e4..cda1cd87efd411b4575dda10bc811d72a34d7ceb`
- Active graph: `dea5f4dee7aadf11435bd95f5f0d8024605e5f298f9a02645aa9352865099b7f`

## Review result

- Reviewed the complete protected-base successor approval, signed v3.17 host-pin update, carried graph-bound Requirements and Architecture evidence, and the transition tests as one closed subject.
- The protected successor table admits exactly the reviewed v3.16 listing digest to the reviewed v3.17 listing digest. Unknown predecessors, alternate successors, missing pins and listing mismatches remain fail-closed.
- The v3.17 fixture is bound to the measured signed ChatGPT/Codex application, Node runtime, macOS root volume, Gatekeeper and sandbox identities. No credential source, sandbox boundary, branch protection or required check is weakened.
- The transition tests preserve immutable v3.15 to v3.16 fixture coverage and bind the current repository HEAD only in the v3.16 to v3.17 transition, so later reviewed rotations cannot invalidate historical checks.
- Current-host model-runner tests passed 21/21. Protected external worker tests passed 15/15. Product-correctness passed 151/151, including PCR-001 through PCR-031 and browser-backed projection checks.
- Requirements and Architecture evidence are immutable direct children of the reviewed v3.17 implementation graph and their exact bytes are carried by this subject.
- No unresolved P0, P1 or P2 finding remains.

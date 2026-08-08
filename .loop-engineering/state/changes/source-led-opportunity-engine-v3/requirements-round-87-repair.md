# StockInsider V3.11.1 — Requirements Round 87 P1 Repair

## Scope

This repair addresses all and only the three independent Round 87 P1 findings. It
creates a new Requirements candidate tree; it is not Architecture authority, product
implementation, an exact implementation commit, a deployment, migration, scheduler
change, V3 activation, merge or push.

## P1-1 — semantic PCR behavior cannot be a generic case-ID dispatcher

`product-correctness.test.mjs` no longer passes `caseId`, fixture digest or an expected
outcome to an owner. It binds every PCR to a pure named semantic module and invokes
each behavior with two independent typed domain vectors: a positive vector and a
behavior-specific mutation. The test owns both expected domain outcomes. The behavior
must also write the exact operation/outcome pair through the supplied observation port.
It rejects identity/fixture/vector names in the operation source and no longer accepts a
`state:'implemented'` or fixture-derived envelope.

The present named seams throw a stable `product_correctness_behavior_not_implemented`
error. Therefore the ordinary command remains intentionally RED for all 31 cases;
there is no temporary green behavior.

## P1-2 — mandatory Node runner can load every declared PCR owner

The owner map now targets pure `.ts` semantic modules. The worker, route, page and two
CLI surfaces import their corresponding boundary, while those Next/TSX/CLI integration
surfaces retain their existing integration owners. Requirements baseline imports the
selected semantic module/export before it emits its pending disposition. It therefore
separates a constructible implementation boundary from a missing behavior RED.

## P1-3 — gate authority begins outside the subject process

`acceptance-gate-runner.mjs` is the only authoritative traceability launcher. Its
frozen `env -i` direct command requires the exact Node 22.14.0 binary, clean detached
reviewed commit, matching working/index Git blobs and no inherited Node loader/preload.
Only then does it launch `acceptance-traceability.test.mjs` with a closed environment.
The subject requires that runner provenance and revalidates the same commit/tree as
defense in depth. `gateAuthorityRows` freezes the runner, PCR test, pure boundaries and
consuming surfaces under one exact digest.

## Reproducible checks

- Requirements baseline owner child for PCR-007: PASS after loading
  `source-semantics.ts` and emitting only its fixture-bound pending disposition.
- The ordinary PCR command remains RED by design: every current seam throws instead of
  manufacturing a semantic success.
- Fresh clean-detached traceability verification and immutable tree identity are
  recorded after all authoritative hashes are recomputed.

## Next authority

Switch to Sol XHigh for an independent fresh Requirements Round 88 over the final tree.
Architecture Round 10 and all implementation/release gates remain locked until that
review reports P0=0 and P1=0.

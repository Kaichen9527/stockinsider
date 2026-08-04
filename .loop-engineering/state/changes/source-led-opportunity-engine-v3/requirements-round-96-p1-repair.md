# Round 96 PCR owner-order repair

Date: 2026-08-01

## Scope and immutable implementation subject

Requirements Round 96 returned `CHANGES_REQUIRED P0=0 P1=1 P2=0`: a clean
graph-rebound declaration could place the PCR version before the owner name and still
pass GOV-004.

The repair implementation is commit `8918ad3f22d231e5153492ff16e8e52c795bfb2b`, tree
`47ec955e6d8b43a6171465ae8fd5ddea708eaf8a`, parent
`ed2bb18cb60b31bf24de9fa0bccd2e462b026fa2` (the separate Round 96 review-evidence
carrier). It changes no production mode, deployment, PR, scheduler, database,
migration, V3 activation or external state.

The catalog remains exactly 5,034 LF-terminated bytes with SHA-256
`8a358ec84aeb9b9eafcef468fb775ea95c6ede4ba3c0424d10b5946cb6192d5f`, 48 active files
and 38 owners. The repaired active graph is
`a61c4979397286cda8d6f9fbcdb8d2d59c3250679d773136f00a42a088c3d5d0`.

## Repair

GOV-004 now extracts normalized PCR name spans and valid three-part version spans, then
pairs them within one bounded 192-character declaration window regardless of whether the
name or version appears first. A non-`v` numeric version must still have nearby
`owner`/`version` context, preventing a date-like tuple from becoming authority. The
only permitted matches remain the exact catalog-bound PCR amendment header and exact
catalog owner row.

The internal full-corpus mutation set now includes version-first full and shortened
owner forms, camel casing, case/spacing and hyphen/punctuation forms. The design,
evidence contract and canonical JSON/Markdown GOV-004 mirror explicitly require pairing
a bounded owner name and three-part version in either order.

## Rebounded full-tree probe

Disposable clean probe commit `2d853f67002426f82ef58840cedc8dfb2689795d`, tree
`d28e0800d4f75e112aa2907ccc35e18ca43b7b85`, rebounded its active graph to
`4885502054dd85269ef38621b6c70b3549d146c08e722520d85ec8f4983021bc` and inserted all
four version-first forms:

```text
v3.11.7 is the product-correctness-runtime owner
version 3.11.7 is the product correctness owner
V3.11.7 is productCorrectnessRuntimeOwner
V3-11-7 :: PRODUCT-CORRECTNESS-RUNTIME-OWNER
```

Focused GOV-004 exited `1` and listed each as an untagged
`product-correctness-runtime-v3.11.7` authority declaration. This proves the lexical
closure, not merely the old graph digest, caused the rejection. The retained local
negative-probe ref is `refs/loop/r96-owner-order-repair-probe`.

## Clean implementation checks

- Protected-harness-shaped focused GOV-001/GOV-004: 2/2 PASS against implementation
  tree `47ec955e6d8b43a6171465ae8fd5ddea708eaf8a`.
- `npm run test:source-led-opportunity-v3`: 53/53 PASS.
- `npm run test:source-led-opportunity-v3:migration`: 20/20 PASS.
- `npm run test:model-runner-v3`: terminal `1..15`, 15/15 PASS and exit 0.
- `npm run v3:doctor -- --expect-mode disabled --require-host-pin
  model-runner-host-pins-v3.5`: PASS; deployment remains `disabled`.
- `git diff --check ed2bb18cb60b31bf24de9fa0bccd2e462b026fa2..8918ad3f22d231e5153492ff16e8e52c795bfb2b`:
  PASS.

This is a repair candidate only. It is not a fresh Requirements PASS, Architecture
PASS, Code Gate, exact-commit review, Verification Gate, PR action, deployment, merge,
runtime installation or production authorization. A fresh independent **Sol XHigh**
Requirements Round 97 must inspect immutable implementation tree
`47ec955e6d8b43a6171465ae8fd5ddea708eaf8a` without edits. Architecture Round 10
remains locked until that review returns PASS.

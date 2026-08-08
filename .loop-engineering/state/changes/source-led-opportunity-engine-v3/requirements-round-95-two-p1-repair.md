# Round 95 two-P1 repair

Date: 2026-08-01

## Scope and immutable implementation subject

Requirements Round 95 returned `CHANGES_REQUIRED P0=0 P1=2 P2=0` for an
order-/phrase-dependent GOV-004 lexical classifier and a required model-runner command
that could end after test 12 without terminal TAP evidence.

The repair implementation is commit `ea513abebea7f0c3907b76fcc00b351095c2d63e`, tree
`19e5a06b7077412a676a31b5226afcfecc01bcd7`, parent
`884d90f7f2d67c6def4493be7d74c7f49f478159` (the separate Round 95 review-evidence
carrier). The implementation changes no production mode, deployment, PR, scheduler,
database, migration, V3 activation or external state.

The catalog remains exactly 5,034 LF-terminated bytes with SHA-256
`8a358ec84aeb9b9eafcef468fb775ea95c6ede4ba3c0424d10b5946cb6192d5f`, 48 active files
and 38 owners. The repaired active graph is
`dcce40bea732c496749e42db0b704530e1ca7e94ea6526dc87475506c0a757b4`.

## P1-1 — authority lexical closure

GOV-004 now normalizes NFKC/case, camel boundaries, `sha256` spelling and punctuation
before applying bounded token-window classification. Catalog identity accepts both
field orders; topology requires explicit file and owner counts in active-graph/topology
context; and PCR owner detection recognizes the full
`product-correctness-runtime-vX.Y.Z` identity. The only exceptions are the two exact,
catalog-derived canonical representations already bound by a GOV-004 authority tag.

The canonical acceptance JSON/Markdown and the governing design/evidence language now
promise this order- and punctuation-independent closure. In-memory mutators cover the
Round 95 `sha-before-byteLength`, active-graph `files/owners`, and full-owner forms.

A separate disposable clean subject proves the rebind case rather than relying on the
old graph digest. Probe commit `d062212997c8e12821aa9ab9acd1b37836b725ee`, tree
`0d5bc33708b2e7195ce04e0d8c97fcfbc7c4231b`, rebounded its graph to
`6bdd5c60de50bfe0eec88840cc3af26f09e75b2c45e35eaa54f31093968c3718` after adding
three untagged declarations: SHA-before-byteLength catalog identity, active-graph
files/owners topology, and the full stale PCR owner. Focused GOV-004 exited `1` and
listed all three lexical classes. The retained local evidence ref is
`refs/loop/r95-authority-rebind-probe`; it is a negative probe, not a candidate.

## P1-2 — model-runner terminal evidence

The real model attempt moved into a tracked detached worker. The protected parent test
uses synchronous bounded supervision and accepts only the exact terminal JSON pass
object; worker error, signal, timeout, stderr or an unexpected payload becomes a normal
test failure instead of leaving the parent without TAP terminalization. The worker
itself retains the existing exact host preflight, sanitized transport and bounded
actual-model attempt.

The complete required command now ends normally:

- `npm run test:model-runner-v3`: `1..15`, `pass 15`, `fail 0`,
  `model_runner_exit=0` (93.400 s). The real-model isolated test itself completed in
  55.921 s.
- `npm run v3:doctor -- --expect-mode disabled --require-host-pin
  model-runner-host-pins-v3.5`: PASS; exact host pin is v3.5 and deployment remains
  `disabled`.

## Clean implementation checks

- Protected-harness-shaped focused GOV-001/GOV-004: 2/2 PASS against implementation
  tree `19e5a06b7077412a676a31b5226afcfecc01bcd7`.
- `npm run test:source-led-opportunity-v3`: 53/53 PASS.
- `npm run test:source-led-opportunity-v3:migration`: 20/20 PASS.
- `git diff --check 884d90f7f2d67c6def4493be7d74c7f49f478159..ea513abebea7f0c3907b76fcc00b351095c2d63e`:
  PASS.

This is a repair candidate only. It is not a fresh Requirements PASS, Architecture
PASS, Code Gate, exact-commit review, Verification Gate, PR action, deployment, merge,
runtime installation or production authorization. A fresh independent **Sol XHigh**
Requirements Round 96 must inspect immutable implementation tree
`19e5a06b7077412a676a31b5226afcfecc01bcd7` without edits. Architecture Round 10
remains locked until that review returns PASS.

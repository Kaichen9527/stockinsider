# Round 97 bare-semver PCR authority repair

Date: 2026-08-02

## Scope and immutable implementation subject

Requirements Round 97 returned `CHANGES_REQUIRED P0=0 P1=1 P2=0`: an untagged PCR
authority line could use a bare three-part version in either order and false-green when
it omitted literal `v`, `owner` and `version`.

The repair implementation is commit `14fcbc3efc21f8903ff3105fcd69dc776dfa6b2e`, tree
`fdd2c5b92bce813bb6c5c5fdce41510bea95d0df`, parent
`809e34e2acde2ad59c8b8536d49513e86832865c` (the separate Round 97 review-evidence
carrier). It changes no production mode, deployment, PR, scheduler, database,
migration, V3 activation or external state.

The catalog remains exactly 5,034 LF-terminated bytes with SHA-256
`8a358ec84aeb9b9eafcef468fb775ea95c6ede4ba3c0424d10b5946cb6192d5f`, 48 active files
and 38 owners. The repaired active graph is
`ab59ae7e825311af1584d7c506b68650ff41fe06f096dbb5e69fbafb47a93db2`.

## Repair and complete matrix

`pcrOwnerIdentity()` still pairs normalized PCR owner-name and valid three-part version
spans within one bounded 192-character declaration window in either order. A literal
`v` version remains authority-like. A bare three-part version is now authority-like
when that pair carries the explicit `authority`, `owner` or `version` context; this
recognizes an actual ownership claim without treating ordinary temporal prose as one.
Only the exact catalog-bound PCR amendment header and catalog owner row remain allowed.

The canonical design, evidence contract and JSON/Markdown GOV-004 mirror define the
same rule. The executable full-corpus matrix rejects all of the following classes after
graph rebind:

- bare `3.11.7`, full owner, version-before/name-before, with `authority`;
- bare `3.11.7`, shortened owner, version-before/name-before, with `authority`;
- bare `3.11.7`, full owner plus `owner` context;
- bare `3.11.7`, shortened owner plus `version` context; and
- prior prefixed, punctuation, camel, casing and spacing variants.

It explicitly permits non-authority controls: date-before/full owner, date-after/full
owner, date/short owner, and an activity sentence containing a bare three-part tuple.

## Rebounded full-tree probes

Disposable clean authority probe commit
`149fe20a6b295876b7a6298fb1ec0b64e123fc4a`, tree
`66613b738a9f83fbb13137806272e60658ebf2c9`, rebounded its active graph to
`1d7d48ecb629ab191673e82e69c876756913a00934beb98aab78a0620895992c` after inserting
all six bare-semver authority forms. Focused GOV-004 exited `1` and reported each as
an untagged `product-correctness-runtime-v3.11.7` authority declaration. The retained
local ref is `refs/loop/r98-bare-semver-authority-probe`.

Disposable clean non-authority control probe commit
`23742717fbd8d8a3b9ee98bc63a79ee9f7e5deaa`, tree
`d21fb2897543eaa3227b8a2b246d05c341f3c982`, rebounded graph
`b617fb6f83b6d8b23349b95b01848d486d1eaf8bcaade0212701669463c0debb` after inserting
all four date/activity controls. Focused GOV-004 passes 1/1. The retained local ref is
`refs/loop/r98-bare-semver-date-control-probe`.

## Clean implementation checks

- Protected-harness-shaped focused GOV-001/GOV-004: 2/2 PASS against implementation
  tree `fdd2c5b92bce813bb6c5c5fdce41510bea95d0df`.
- `npm run test:source-led-opportunity-v3`: 53/53 PASS.
- `npm run test:source-led-opportunity-v3:migration`: 20/20 PASS.
- `npm run test:model-runner-v3`: terminal `1..15`, 15/15 PASS and exit 0.
- `npm run v3:doctor -- --expect-mode disabled --require-host-pin
  model-runner-host-pins-v3.5`: PASS; deployment remains `disabled`.
- Syntax, JSON, `git diff --check
  809e34e2acde2ad59c8b8536d49513e86832865c..14fcbc3efc21f8903ff3105fcd69dc776dfa6b2e`
  and tracked-environment-artifact scan: PASS.

This is a repair candidate only. It is not a fresh Requirements PASS, Architecture
PASS, Code Gate, exact-commit review, Verification Gate, PR action, deployment, merge,
runtime installation or production authorization. A fresh independent **Sol XHigh**
Requirements Round 98 must inspect immutable implementation tree
`fdd2c5b92bce813bb6c5c5fdce41510bea95d0df` without edits. Architecture Round 10
remains locked until that review returns PASS.

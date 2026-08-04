# Round 98 closed PCR declarator grammar repair

Date: 2026-08-02

## Scope and immutable implementation subject

Requirements Round 98 returned `CHANGES_REQUIRED P0=0 P1=1 P2=0`: the approved bare
three-part-PCR-version closure did not recognize an unambiguous full runtime owner
joined to the version by `=` in either order.

The repair implementation is commit `89f0be4fc8aff3c0eed531d21a6518eff158f84f`, tree
`7c8100f69c1fa1af569bfaa5afebc1f1742b6160`, parent
`c6bcf7d4e04ae506abc9b4e8f9b848089106f3a2`. It changes no production mode,
deployment, PR, scheduler, database, migration, V3 activation or external state.

The catalog remains exactly 5,034 LF-terminated bytes with SHA-256
`8a358ec84aeb9b9eafcef468fb775ea95c6ede4ba3c0424d10b5946cb6192d5f`, 48 active files
and 38 owners. The repaired active graph is
`97359bfabddb7a52b50c5da05f75a5f93a5a641f8f3d1d4ef20e1b84174232b7`.

## Closed grammar and retained controls

The oracle preserves the prior bounded 192-character PCR owner/version scan and its
literal-`v` authority rule. For a bare dotted three-part semver, the additional closed
grammar now recognizes only a direct declarator between a full or shortened PCR owner
and the tuple, in either order:

- full `product correctness runtime` or shortened `product correctness` owner;
- direct `=`, `:`, `is` or `equals`; and
- dotted `major.minor.patch` semver.

Existing bounded `authority`, `owner` and `version` context forms remain authority-like.
The special declarator normalizer preserves only `=`/`:` and dotted semver. Thus a
hyphenated date such as `2026-08-02` cannot silently become a bare version claim.

The executable mutation matrix covers 16 direct forms (two owner spellings × four
declarators × name-first/version-first), the two existing bounded context forms, and
six non-authority date/activity controls. The same grammar is normative in design,
evidence contract and the JSON/Markdown GOV-004 mirror.

## Clean graph-rebound probes

Disposable clean authority probe commit
`2e40c95c9c5b381fff70616315c53f12ccaf24ef`, tree
`5a73b07580ca98d8889290ba6c04b3cc80701cbb`, rebounded graph
`4b28deef427bab0ecf76efcae632a192ac32c2bcf3d6b01faaccd7d3c6c1942d` after inserting
all 16 direct bare-semver declarator claims. The retained local ref is
`refs/loop/r99-closed-declarator-authority-probe`; Round 99 must independently verify
that GOV-004 fails closed on that exact corpus.

Disposable clean non-authority control probe commit
`e65fa9f98924d8c708ccea29ad1e0c12cf53a077`, tree
`945ab0a227e701f7a99331b562298dab90ea8d49`, rebounded graph
`15b81abfc260cf3375c79c6e05ff1696c48ded6605105dfca5c4cf3d679c9d48` after inserting
the six date/activity controls. The retained local ref is
`refs/loop/r99-closed-declarator-control-probe`; Round 99 must independently verify
that GOV-004 accepts that exact control corpus.

## Local implementation checks

- `node --check scripts/opportunity-v3/acceptance-traceability.test.mjs`: PASS.
- `acceptance-tests.json` parse and JSON/Markdown mirror source update: PASS.
- `git diff --check c6bcf7d4e04ae506abc9b4e8f9b848089106f3a2..89f0be4fc8aff3c0eed531d21a6518eff158f84f`:
  PASS.
- Direct extraction of the committed oracle: direct declarator matrix `16/16`, bounded
  context forms `2/2`, and non-authority controls `6/6` all return their specified
  result.

This is a repair candidate only. It is not a fresh Requirements PASS, Architecture
PASS, Code Gate, exact-commit review, Verification Gate, PR action, deployment, merge,
runtime installation or production authorization. A fresh independent **Sol XHigh**
Requirements Round 99 must inspect immutable implementation tree
`7c8100f69c1fa1af569bfaa5afebc1f1742b6160` without edits. Architecture Round 10
remains locked until that review returns PASS.

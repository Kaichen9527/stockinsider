# Round 94 GOV-004 lexical-closure repair

Date: 2026-08-01

## Scope and immutable subject

Round 94 returned `CHANGES_REQUIRED P0=0 P1=1 P2=0` because the then-current
GOV-004 extractor recognized only five display regexes. A rebounded graph could add
semantically conflicting authority claims in unregistered syntax and still pass.

The repair implementation is commit `73ab42010158a7a27e859e45790392a3669b77ad`, tree
`73893409a94c943e4aa0f94256387c545b4705b5`, whose parent is the Round 94 evidence
carrier `0f649238b493b8954f87b243c3bd19a58f5f7288`. It changes no migration, runtime
mode, production flag, deployment, PR, scheduler, database or external state.

The catalog remains 5,034 LF-terminated bytes with SHA-256
`8a358ec84aeb9b9eafcef468fb775ea95c6ede4ba3c0424d10b5946cb6192d5f`, 48 active
files and 38 owners. The repaired graph digest is
`a0b209641919fb7f86dada6328dfae0c59526ab5b4e65d05bdbed09544e8a117`.

## Repair

The design and evidence contract now carry exactly five one-line
`GOV-004-AUTHORITY` tags. Each has a canonical RFC 8785 JSON payload for one managed
authority: design catalog identity, design active-file topology, design shortened PCR
owner, evidence catalog identity, and evidence file/owner topology.

The executable oracle now:

- requires the exact canonical set, no missing or duplicate rows and no non-canonical
  key order or conflicting payload;
- derives tag values from the catalog and the product-correctness owner header rather
  than from a hard-coded display format; and
- scans every non-tag line in every active blob. A value-bearing lexical claim for
  catalog identity, active topology or a shortened product-correctness owner rejects
  unless it is represented by its canonical tag.

The in-memory full-graph mutations exercise missing, duplicate-equal, conflicting and
non-canonical tags, plus key/value, uncommaed, hyphenated, paired-number, case and
spacing alternatives. The acceptance JSON/Markdown mirror describes the same closure.

## Rebounded full-tree probes

Each disposable probe started from the repair implementation, modified an active
document, recomputed its graph digest, updated the disposable test constant and
committed a clean detached subject. Thus a failure below is lexical closure, not the
frozen graph-digest check.

| Probe | Subject | Rebound graph | Result |
| --- | --- | --- | --- |
| key/value + hyphen | `5c71c663d5e98528652a23b7202114c4cc66da92` / `91083ff173ea4bdeca798ddbff309b62f9a5613a` | `541eb853ce9e7a73f0f00960aa3c1ed9b39465cb77879851afe98428870517d1` | GOV-004 exits 1 and lists catalog identity, active-graph topology and shortened product-correctness owner. |
| uncommaed + case/spacing | `aa7ebd045b244ceaf1884e0b369e763be50e121b` / `fce2af773dc813e470828444d7ff7f968633a636` | `ac195815aa704e7207f20c8628bbf5963f560f2995b322b9f24d4b031b7db92e` | GOV-004 exits 1 and lists the same three lexical classes. |

The first inserted `byteLength=5033; sha256=…`, `active-files=45;
owner-count=37`, and `product-correctness owner version v3.11.7`. The second inserted
uncommaed catalog bytes/SHA, `45-file/37-owner`, and upper-case extra-spaced
`PRODUCT CORRECTNESS v3.11.7` forms.

## Clean implementation checks

- Protected-harness-shaped focused GOV-001/GOV-004: 2/2 PASS.
- `npm run test:source-led-opportunity-v3`: 53/53 PASS.
- `npm run test:source-led-opportunity-v3:migration`: 20/20 PASS.
- `npm run test:model-runner-v3`: PASS.
- `npm run v3:doctor -- --expect-mode disabled --require-host-pin model-runner-host-pins-v3.5`: PASS; deployment state remains `disabled`.

This evidence records a repair candidate only. It is not a Requirements PASS,
Architecture PASS, Code Gate, Verification Gate, exact-commit review, deployment,
merge, runtime installation or production authorization. Fresh independent **Sol
XHigh** Requirements Round 95 must review implementation tree
`73893409a94c943e4aa0f94256387c545b4705b5` without edits. Architecture Round 10 stays
locked until that result is PASS.

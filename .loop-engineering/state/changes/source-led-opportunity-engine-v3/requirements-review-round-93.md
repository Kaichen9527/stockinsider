# StockInsider V3.11.1 — Requirements Gate Round 93

## Result

`CHANGES_REQUIRED` — `P0=0 P1=1 P2=0`

This was an independent fresh Sol XHigh Requirements review of immutable subject
commit `87e85da309f5f225558afb5d0d66f55c9fd774bc`, tree
`57235087ed47d6f171cd1979332bb227efb74e52`, parent
`9639efe5806c5721431b7f829eddc7e47d7e019b`. The separate evidence carrier before
this review was commit `b882343e3c8f80b3098769c23af16dc51a445521`, tree
`a7bd236431dfd4d12ad0a933df0f09bc7c21a071`; its four changed paths are evidence/
status only and are not part of the reviewed active graph.

The subject repair range changes seven tracked paths with 33 additions and 12
deletions. It contains no deployment, migration application, runtime installation,
scheduler, flag, production-data, merge, push or PR mutation. `git diff --check`
passes and the tree contains none of the prohibited `node_modules`, `.DS_Store`,
`__pycache__` or `.pyc` artifact classes.

## Independent current-state recomputation

The exact subject currently agrees with its declarations:

```text
active-artifact-catalog-v3.json bytes: 5034
catalog SHA-256: 8a358ec84aeb9b9eafcef468fb775ea95c6ede4ba3c0424d10b5946cb6192d5f
active files / owners: 48 / 38
active graph SHA-256: 341da713d48b747eaf0dc2e8e87980beb84b1092e137610d137e50d6b4ab899e
short product-correctness prose edges: [3.11.8]
design topology edges: [48]
evidence topology edges: [[48,38]]
```

All 48 active paths are unique, present, nonempty and byte-equal between the detached
working tree and subject Git blobs. All 38 owner rows are unique and their exact owner
headers match. GOV-001 confirms exact `1.44.1` / 297 JSON-Markdown parity and the
143/148/6 classification plus 20/28/249 track partitions.

## Round 92 closure

| Round 92 finding | Round 93 assessment |
| --- | --- |
| P1-1 current catalog/topology prose contradiction | **Current bytes closed, general fail closure still open in P1-1 below.** Current prose is 5,034 bytes, exact catalog SHA and 48/38. |
| P1-2 current shortened product owner contradiction | **Current bytes closed, general fail closure still open in P1-1 below.** The only current edge is v3.11.8. |
| P2-1 runner count underreported | **Closed.** Both repair mirrors say 15/15 and fresh complete TAP is 15/15. |
| P2-2 pending tree did not identify candidate | **Closed.** Status selects exact tree `57235087ed47d6f171cd1979332bb227efb74e52` and separately names its evidence. |

## Finding

### P1-1 — GOV-004 still accepts coexisting stale active declarations

The Round 92 repair added presence assertions for the correct catalog identity,
topology and shortened product-correctness edge, plus one rejection for the already
known v3.11.4 literal. It does not enumerate the declarations and require an exact
singleton/equality set. Therefore an obsolete declaration can coexist with the correct
one without violating any assertion.

Two disposable clean detached mutation commits reproduced the false green. These probe
objects are not the reviewed subject and are not release evidence:

1. Probe commit `b8a43b884c7b133816cd515ee5525d7edf1caf69`, tree
   `c792e5b764a7c818339485c7e2d55c5da2ada69e`, appended a shortened
   product-correctness v3.11.7 edge and a 45-file/37-owner topology edge while retaining
   the correct statements. After recomputing and freezing active graph
   `6429d80db41811434d51b2249e222ad47d6d7243d2121a78bcea3cf53780f906`, focused
   GOV-004 returned PASS 1/1.
2. Probe commit `474acf4103b854769a8340be30401d6ef1195a67`, tree
   `ad54b21cfa9fcf13998150256473bf764662eb9e`, additionally appended a contradictory
   5,033-byte catalog identity with all-zero SHA. After recomputing and freezing active
   graph `9259bfebb72e1f1587a1f9e11d07c564109a2b27c1f2242d75f5e2f6caa81f9c`, focused
   GOV-004 again returned PASS 1/1.

This directly contradicts canonical GOV-004's expected result that stale active catalog
topology/hash or owner prose fails closed, and Round 92's requirement that a stale
shortened owner reference cannot coexist with catalog/header authority.

Repair must define typed/exhaustive declaration grammars for the catalog byte/SHA
identity, active-file/owner topology and shortened product-correctness owner edge;
extract every matching declaration from the active documents; require exact cardinality
and all values equal the catalog/header authority; and add executable mutations for
missing, duplicate-equal, duplicate-conflicting and arbitrary-old-version cases. The
active document changes require a newly frozen graph and immutable tree.

## Fresh verification

| Check | Result |
| --- | --- |
| clean detached subject and graph recomputation | PASS — exact values above |
| `npm run test:source-led-opportunity-v3` after clean-checkout `npm ci` | PASS — 53/53 |
| `npm run test:source-led-opportunity-v3:migration` | PASS — 20/20 |
| `npm run test:model-runner-v3` | PASS — 15/15 |
| `npm run v3:doctor -- --expect-mode disabled --require-host-pin model-runner-host-pins-v3.5` | PASS — exact host preflight; deployment disabled |
| clean protected-harness-shaped GOV-001/GOV-004 | PASS — 2/2; mutation false green is the P1 |
| authenticated GitHub Ruleset 20177392 read | PASS — Active, default/main, empty bypass, PR plus exact required/up-to-date check, force-push blocked |
| first pre-install product attempt | NOT EVIDENCE — missing ignored dependency; rerun above passed after `npm ci` |

Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; no elapsed cohort was generated or
reclassified. Ordinary PCR implementation remains the explicit planned RED state and
is not represented as a Code Gate PASS.

## Required next step

Architecture Round 10 remains locked. Use **Terra XHigh** to repair the one P1 in a new
immutable tree, then return to **Sol XHigh** for independent fresh Requirements Round
94. This result grants no Architecture, implementation, Code Gate, Verification, PR,
deployment, migration, scheduler/flag or production authority.

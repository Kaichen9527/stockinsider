# Requirements Round 84 P1 Repair

This repair derives from independently reviewed immutable Requirements subject
`58516bb987d808eb7d24d8aa613c887764aa7f2a`. It changes Requirements/test authority
and public typed serialization only. It performs no Architecture review, product
runtime implementation, runtime installation, migration, deployment, merge, push or
production mutation.

## Four repaired P1 findings

| Round 84 P1 | Repair |
|---|---|
| 1. PCR placeholders | Every PCR now builds the exact canonical `[id,requirement,layer,setup,expected]` fixture, hashes it and calls the code-owned `evaluateProductCorrectnessFixture` seam. Requirements baseline mode accepts only the fixture-bound structured pending disposition and verifies it for all 31 owner children; ordinary Code Gate mode requires `implemented` with setup/expected evidence and currently fails all 31 with their own exact setup/expected text. |
| 2. Unfrozen GOV-004 | GOV-004 now resolves a named reviewed Git tree, requires index and active working bytes to equal that tree, recomputes all 45 blob rows, compares to frozen graph `a93a85312b2b5d924d58da4c7ba2e19657018ea0991e236fbd14eb4472e1ea40`, and perturbation-checks catalog bytes plus path/OID/length/SHA for every row. |
| 3. Unserializable PE conflict | `authority_conflict` is now a closed reported-PE unavailable and valuation-review reason. The financial selector requires it to propagate unchanged from a conflicting official observation or shares fact; PCR-030 mirrors that branch. |
| 4. Retained environment artifacts | The new immutable tree omits all 16 `scraper/__pycache__/*.pyc` blobs. They remain ignored local cache files only; no source file is deleted. |

## Recomputed repair identity

The active catalog remains 4,133 bytes with SHA-256
`92c2b9ba9705c95dfc17d5b398b5e87811430a2f65cb1022bcf01b1e5f52d792`, 45 strict
ASCII-ordered active files and 37 strict ASCII-ordered owners. The repaired active
graph preimage is 6,710 RFC 8785 UTF-8 bytes and SHA-256 is:

```text
a93a85312b2b5d924d58da4c7ba2e19657018ea0991e236fbd14eb4472e1ea40
```

Acceptance remains `1.44.0/297`: JSON/Markdown retain exact ordered parity, the
297 owner rows retain digest
`43054d1bccb016d37cb24e999cb9179a88acaa1ab6356498b81ec6096d6048f4`, and the 12
script rows retain digest
`d6caeb641cde6a2f07480704a6fe768f5dc4978d92bc958f0f2874cb94fbcd3e`.

## Mechanical checks

- `node --check` passes for `acceptance-traceability.test.mjs`; the product-correctness
  test parses with Node's TypeScript strip mode.
- Requirements baseline mode passes all 31 named PCR TAP owners and emits exactly one
  fixture-bound pending record per owner.
- The traceability PCR baseline owner oracle replays and validates all 31 owner-child
  records; ordinary product-correctness mode fails all 31 named tests with the exact
  fixture setup/expected text, so it cannot be mistaken for Code Gate PASS.
- Focused GOV-004 passes against a temporary index and the named repair tree, including
  frozen graph, working/index/tree equality and all 181 graph mutation checks.
- `authority_conflict` occurs in both reported-PE and valuation public unions and in
  the mirrored PCR-030 setup/expected text.
- The repair tree has zero tracked `node_modules/**`, `scraper/venv/**`,
  `scraper/**/__pycache__/*.pyc` and `.agent/reports/**` paths.

Fresh independent Requirements Round 85 over the resulting immutable subject is still
mandatory. Architecture and implementation remain locked. The 31 structured pending
PCR dispositions block Code/Verification Gate until corresponding runtime behavior is
implemented, and evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`.

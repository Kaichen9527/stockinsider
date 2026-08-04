# Requirements Round 83 P1 Repair

This repair derives from the independently reviewed immutable Requirements subject
`7430d106276864b3d59403ebcd7918e97f8b6c1a`. It changes the active requirements graph,
acceptance authority and its explicit preimplementation baseline only. It performs no
Architecture review, product implementation, runtime installation, migration, deploy,
merge, push or production mutation.

## Six repaired P1 findings

| Round 83 P1 | Repair |
|---|---|
| 1. Missing suite-backed owners | The 117 non-PCR logical owner handles now resolve through the sole exhaustive `suiteOwnerVariants` map to their exact source/TAP test pairs. PCR-001 through PCR-031 now each have an exact non-skipped `acceptance <ID>` owner. All 31 are explicit V3.11 RED baselines until their required product/runtime behavior is implemented; they are not a Code Gate pass. |
| 2. Non-constructible BIAS history | Block-local raw rows now retain adjusted open/high/low/close plus the full nested `adjusted-price-evidence-v3.1` tuple. Endpoint calculation uses a chronological 120-row inclusive MA window and 14 true-range terms with its preceding close. The exact cardinality is `max(0,N-119)`, therefore 252..758 available endpoints and 758 at 877 selected sessions. |
| 3. Nondeterministic reported-PE shares | The sector selector first distinguishes matching/current session authority from `calendar_authority_mismatch`, then chooses one filtered official shares fact by greatest period end and the full authority-time/restatement/source-ref order. |
| 4. Open timing-risk union | `timingRisk` is now a status-discriminated union: only observe-only/bias-observe-only, blocked/technical hard-state reason, and unavailable/technical-unavailable are representable. |
| 5. Incomplete GOV-004 graph proof | The meta oracle now reads stage-zero Git blobs, validates the catalog's tracked bytes/SHA, ASCII order and 45-file/37-owner closure, recomputes every blob row and active graph, and proves catalog-byte, order and blob-SHA perturbations change the result. |
| 6. Inherited environment artifacts | The new immutable tree removes tracked `node_modules/**`, `scraper/venv/**`, Python bytecode caches and `.agent/reports/**`; existing `.gitignore` rules continue to prevent reintroduction. |

## Recomputed repair identity

The active catalog remains 4,133 bytes with SHA-256
`92c2b9ba9705c95dfc17d5b398b5e87811430a2f65cb1022bcf01b1e5f52d792`, 45 ordered active
files and 37 ordered owners. The repaired active-graph preimage is 6,710 RFC 8785 UTF-8
bytes and SHA-256 is:

```text
2f52c1f4bfab4d8483e20d3e9747a765c67a8c221d273d878ba92549f9175335
```

The canonical inventory remains `1.44.0` / 297 cases. JSON/Markdown case parity,
297 owner rows and the existing owner/script digests remain exact; only the three
affected PCR case descriptions changed in both mirrors.

## Mechanical checks

- `node --check` passes for the acceptance traceability and product-correctness files.
- JSON parsing and all 297 JSON/Markdown case rows have exact ordered parity.
- The exact 117 non-PCR suite mappings all name a test variant present in their mapped
  source; the 31 PCR owner names are all registered as non-skipped TAP tests.
- A temporary-index checkout of the repaired tree runs the focused `GOV-004` oracle
  successfully and validates the full Git-blob active-graph calculation.
- The repair range passes `git diff --check`; the final immutable tree is separately
  checked for the environment-artifact paths before handoff.

Fresh independent Requirements Round 84 over the resulting immutable subject is still
mandatory. Architecture and implementation remain locked. The next reviewer must not
claim a Code Gate or Verification PASS while the 31 explicit PCR RED baselines remain.

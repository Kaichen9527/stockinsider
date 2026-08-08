# Requirements Gate Round 84 — StockInsider V3.11.1

Immutable base tree: `7430d106276864b3d59403ebcd7918e97f8b6c1a`
Immutable subject tree: `58516bb987d808eb7d24d8aa613c887764aa7f2a`

## Findings

### P1-1 — The 31 PCR cases are unconditional placeholders, not an executable preimplementation RED oracle

The acceptance authority requires each PCR test to report the exact missing behavior
and describes the RED set as a bounded baseline rather than a waiver
(`11707679cad83148b997343752a2c02eabe5698f:acceptance-evidence-contract.md:64-68,88-93`).

The actual owner blob imports only `assert` and `node:test`; every case unconditionally
calls:

```js
assert.fail(`${id} RED: ${requirement} has no implementation under test yet`);
```

Evidence:
`14fc2c1199a8171d9cb2c8dd9253b92f8095e069:scripts/opportunity-v3/product-correctness.test.mjs:1-5,7-64`.

These tests do not construct any acceptance fixture, call any implementation, or verify
the detailed setup/expected behavior in `acceptance-tests.md:323-353`. Implementing the
product behavior alone cannot make them green; the tests themselves must be replaced.
This contradicts the claim that implementation will make the 31 cases pass and does not
provide executable Requirements authority.

The canonical resolver also has no allowed-RED result path. `executeOwnerSuite` uses
uncaught `execFileSync`; any PCR nonzero exit throws before output inspection
(`9eeb86f26b8f44210a8be08cb1a0ad1a85895d92:acceptance-traceability.test.mjs:2239-2275`).
The registry loop invokes that executor directly (`:2412-2417`). Consequently it cannot
distinguish the declared PCR assertion from a syntax error, process crash, wrong message,
unexpected assertion, or other nonzero result, and it stops at the first PCR failure
rather than validating all 31 expected RED outcomes.

The non-PCR portion is repaired correctly: independently parsing the immutable source
found exactly 117 unique mappings, exactly the 117 non-PCR suite IDs, and every mapped
source/test-name pair has exactly one actual named declaration.

### P1-2 — GOV-004 recomputes an unconstrained graph digest and never enforces the claimed immutable identity

The oracle correctly derives all 45 `[path,blobOid,byteLength,sha256]` rows, but then
only checks that the resulting digest looks like 64 lowercase hex characters:

- graph construction:
  `9eeb86f26b8f44210a8be08cb1a0ad1a85895d92:acceptance-traceability.test.mjs:148-160`
- sole result assertion: `:161`
- limited mutation probes: `:162-180`

It never compares the result to the required subject digest
`2f52c1f4bfab4d8483e20d3e9747a765c67a8c221d273d878ba92549f9175335`.

That literal appears only in `requirements-round-83-repair.md:28`, which is not in the
45-file active catalog, and nowhere in the executable oracle. An arbitrary
active-contract semantic mutation that preserves the checked header/version probes
produces a new valid-looking digest and can still pass GOV-004. The probes swap two rows
and alter only the first row's SHA; they do not enforce the frozen graph value or
independently mutate every member/path/OID/length as claimed.

Additionally, `indexedBlob` reads the mutable stage-zero index via
`git ls-files --stage`, not a named subject tree (`:102-117`). Working/index equality
is checked, but index/subject-tree equality is not. A clean-checkout convention does not
replace an executable immutable-tree assertion.

### P1-3 — Official reported-PE conflict semantics produce an unrepresentable public outcome

The repaired selector deterministically resolves current-session calendar authority and
selects shares across periods, but it also defines a terminal `authority_conflict` when
same-precedence shares facts disagree
(`106cc1deb8c235bc02ed05da780dd23b8364d5f1:financial-data-contract.md:142-155`).
The reported-PE observation selector already has the same terminal conflict at
`:131-134`, and manifest excluded rows retain the domain's closed reason
(`manifest-storage-contract.md:55-67`).

The public union cannot represent that outcome.
`ReportedPeUnavailableReasonV311` omits `authority_conflict`
(`966279ab039ff64cda984499cf8cddc201575fea:data-contract.md:189`), while all current,
history, and sector unavailable branches require that enum (`:207-215`). The
valuation-axis reason union also omits it (`:198-200`).

Thus a contractually valid selector result has no constructible typed serialization. No
rule authorizes silently converting it to `missing_shares_outstanding` or another
reason. This violates the active graph's closed-outcome requirement and PCR-030's
"every reported-PE branch" typed-serialization authority.

### P1-4 — The immutable subject still contains 16 prohibited Python cache blobs

`git ls-tree -r 58516bb... -- scraper/__pycache__` returns 16 tracked regular blobs:

- `common.cpython-{38,39}.pyc`
- `feature_engineering.cpython-{38,39}.pyc`
- `ingestion_pipeline.cpython-{38,39}.pyc`
- `kol_scraper.cpython-{38,39}.pyc`
- `line_dispatcher.cpython-{38,39}.pyc`
- `market_trends.cpython-{38,39}.pyc`
- `sentiments_scraper.cpython-{38,39}.pyc`
- `strategy_engine.cpython-{38,39}.pyc`

For example, `scraper/__pycache__/common.cpython-38.pyc` is blob
`0e33303753c7b10b7dd4d3c35bc19d2225b79eb4`, and
`strategy_engine.cpython-39.pyc` is blob
`70e4c68ab5dbddfb307f7192626e24aa4c7774ca`.

The other prohibited categories are absent: tracked `node_modules/**` = 0,
`scraper/venv/**` = 0, and `.agent/reports/**` = 0. The retained `.pyc` blobs
nevertheless leave Round 83 item 6 open.

## Recomputed evidence

| Check | Immutable recomputation |
|---|---|
| Catalog bytes | `4,133` |
| Catalog SHA-256 | `92c2b9ba9705c95dfc17d5b398b5e87811430a2f65cb1022bcf01b1e5f52d792` |
| Active files | `45`, unique, strict ASCII order |
| Owner rows | `37`, unique, strict ASCII order; every owner is active |
| Owner headers | 37/37 exact |
| Active reference edges | 57 checked; 0 stale, 0 unknown owners |
| Blob rows | 45/45 regular, nonempty blobs with independently recomputed OID/length/SHA |
| Graph preimage | `6,710` bytes |
| Active graph SHA-256 | `2f52c1f4bfab4d8483e20d3e9747a765c67a8c221d273d878ba92549f9175335` |
| Acceptance inventory | version `1.44.0`; declared/actual/unique = `297/297/297` |
| JSON/Markdown parity | exact ordered parity, 297 rows |
| Classifications | `semantic_automated=143`, `semantic_suite_backed=148`, `structural_meta=6` |
| Tracks | `product_runtime=249`, `evaluation_governance=20`, `model_runner=28` |
| Acceptance owner rows | 297 unique, strict ASCII order, 0 classification/track/owner-handle mismatches |
| Owner digest | `43054d1bccb016d37cb24e999cb9179a88acaa1ab6356498b81ec6096d6048f4` |
| Non-PCR suite mapping | 117 rows, 117 unique IDs, exact expected ID set, 0 missing named source variants |
| PCR declarations | 31 unique IDs, `PCR-001..PCR-031`, no skip/todo declarations |
| Script rows | 12 unique, strict ASCII order; 0 package-value mismatches |
| Script digest | `d6caeb641cde6a2f07480704a6fe768f5dc4978d92bc958f0f2874cb94fbcd3e` |
| Subject prohibited artifacts | node_modules `0`; venv `0`; `.agent/reports` `0`; `.pyc` caches `16` |
| Exact range | 1,244 paths: 1,233 artifact deletions, 10 modifications, 1 addition |
| Deletions outside prohibited-artifact classes | `0` |
| Product/runtime/production mutations | `0`; all 11 nondeletions are Requirements/test repair files |
| `git diff --check base subject` | PASS, no output |

The first and last recomputed graph rows were:

- `acceptance-evidence-contract.md`, blob
  `11707679cad83148b997343752a2c02eabe5698f`, 19,827 bytes, SHA-256
  `19fc80b8e7b1eadcae9310d409813aace87a0259e54706cccf7c5a7fbe26a7b3`
- `valuation-contract.md`, blob `c69d2fcc34f64adfdbcfc6b54c020ff03b6c8e8c`,
  25,222 bytes, SHA-256
  `778835eb4e8cc00384284ac71e119da5a98b96f6122d1bd4a9eef1a871eeebfe`

## Round 83 closure assessment

| # | Prior P1 | Round 84 status | Assessment |
|---|---|---|---|
| 1 | Executable acceptance ownership | **OPEN — P1-1** | All 117 non-PCR mappings resolve to exact named variants. The 31 PCR names exist and are non-skipped, but are unconditional failures with no implementation under test, and the meta-test has no expected-RED discriminator. |
| 2 | BIAS construction | **CLOSED** | Full adjusted OHLC plus complete adjustment evidence is retained; sessions/chunks/overlap are chronological and bounded; inclusive MA windows and ATR high/low/prior-close formula are exact; endpoints are `max(0,N-119)`, available `252..758`, exactly 758 at `N=877`; raw/history bounds are finite and consistent. |
| 3 | Official PE | **OPEN — P1-3** | Calendar-authority selection and the single cross-period shares selector are deterministic, including tie order and terminal conflict. The resulting `authority_conflict` is absent from the public closed reason union, leaving a non-constructible branch. |
| 4 | `timingRisk` union | **CLOSED** | `observe_only/bias_observe_only`, `blocked/{below_support,reclaim_required,invalidated}`, and `unavailable/technical_unavailable` are disjoint; unavailable shadow points are all null. |
| 5 | GOV-004 oracle | **OPEN — P1-2** | Catalog bytes/hash, order, uniqueness, 45/37 closure, blob rows, and working/index equality are checked, but the recomputed graph is not compared with the claimed immutable digest or subject tree. |
| 6 | Immutable subject/artifact scope | **OPEN — P1-4** | The range contains no unrelated destructive/product/production change and removes 1,233 environment artifacts, but 16 tracked `scraper/__pycache__/*.pyc` blobs remain in the subject. |

## PCR boundary assessment

The PCR baseline is numerically bounded—31 ordered IDs—and its names are exact. It is
not a legitimate executable Requirements baseline:

1. The detailed acceptance setup and expected outcomes are not encoded in the tests.
2. Every test fails without touching implementation.
3. Product implementation alone cannot turn any test green.
4. The canonical meta-test treats every PCR nonzero result identically and cannot
   validate the expected RED message or distinguish accidental failure.
5. Its first PCR exception aborts the suite-owner reconciliation, so it does not prove
   all 31 expected RED owners in one canonical run.

Accordingly, these failures cannot be called Code Gate or Verification PASS, and they
also cannot supply the missing executable Requirements authority.

No P0 or P2 findings were identified. The BIAS and timing-risk repairs are internally
bounded and constructible, and the exact range contains no release, deploy, migration,
runtime-installation, flag, scheduler, or production authority drift.

VERDICT: CHANGES_REQUIRED P0=0 P1=4 P2=0

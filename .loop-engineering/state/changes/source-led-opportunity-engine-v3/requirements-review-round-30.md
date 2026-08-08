# Requirements Gate Round 30

**Verdict: `CHANGES_REQUIRED`**

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 4 |
| P2 | 0 |

Requirements Gate does **not** pass. Architecture Gate remains locked and may not run.

Citations below use:

- `H` = `6ed9c7e2efb17a9fc6121a58e477344356ef137c`
- `C` = `.loop-engineering/state/changes/source-led-opportunity-engine-v3`

## Immutable evidence

- Baseline: `12c131aa50ca53268878e9f025973533ac100c49`
- Baseline tree: `c90ff9b693a6c8e0acb3d23b7068a231347e318c`
- HEAD: `6ed9c7e2efb17a9fc6121a58e477344356ef137c`
- HEAD tree: `8a8453ca2c2984fe601ed62181089e69b58b7301`
- Merge base: exactly the baseline.
- Range shape: 34 commits ahead, zero behind, strict single-parent chain, zero merges.
- Changed paths: exactly 71 added paths—70 under `C/` plus `.specify/memory/constitution.md`; no other path changed.
- Active normative catalog: 32 artifacts, as mechanically defined by `H:C/design.md:L24-L32`.
- Requirements rounds 1–28 were not opened. Round 29 and Architecture rounds 1–2 were read only for closure re-audit.
- Gate policy requires zero blocker/high findings: `H:AGENTS.loop-engineering.md:L1-L10`, `H:docs/engineering/LOOP_ENGINEERING.md:L3-L15`, `H:.loop-engineering/policy.yaml:L6-L10`, `H:.specify/memory/constitution.md:L5-L25`.

All reviewed bytes and calculations came from immutable Git objects using the specified Git metadata path with `GIT_OPTIONAL_LOCKS=0`; no file, ref, index, process state, network resource, application code, migration, database, or runtime state was modified.

## P1 findings

### P1-1 — Corporate-action-adjusted price authority is not constructible

The repair now specifies the exchange/provider allowlist, owner/fallback precedence, cutoff ordering, ties, corrections, 64/65 revision bound, and consumer hash propagation: `H:C/market-contract.md:L45-L64`.

But adjusted OHLC remains caller-supplied:

- The input accepts raw OHLC, adjusted OHLC, and `corporate_action_version`: `H:C/postgres-type-contract.md:L150-L159`.
- Storage checks finite/range consistency, provider/exchange, timestamps, and the literal version, but does not recompute adjusted values: `H:C/storage-schema-contract.md:L81`.
- The price preimage only names `tw-corporate-action-v3.0`; it defines no action-event source, factor, formula, effective/recorded cutoff, correction order, or recomputation oracle: `H:C/market-contract.md:L47-L60`.
- Requirements nevertheless demand official corporate-action-adjusted closes: `H:C/requirements.md:L102-L106`.

An exhaustive active-artifact search found no corporate-action ledger or adjustment-factor authority. `MKT-018` varies version tags but supplies no exact split/dividend fixture or expected adjusted values: `H:C/acceptance-tests.json:L223`.

### P1-2 — Source and seven-authority enumeration remains globally unbounded

The 64/65 limits cap history after a family or stream key is known, but do not bound discovery across arbitrarily many cutoff-ineligible keys:

- Source selection filters eligibility, partitions by family, probes 65 rows per enumerated family, then applies the 1,000,001 sentinel only to post-collapse eligible families: `H:C/source-adapter-contract.md:L11-L17`.
- Authority selection first enumerates cutoff-eligible stream keys, collapses each, and applies the family sentinel afterward: `H:C/authority-supersession-contract.md:L19-L35`.

Arbitrarily many source families can contain only future-knowledge rows, and arbitrarily many authority streams can contain `recordedAt <= C` but `validFrom > C`. Neither population reaches the post-collapse sentinel, while no global raw/key bound or materialized head authority limits work needed to exclude them.

`SRC-014` and `AUTH-008` test revisions 64/65 inside individual streams, not a global `N/N+1` cutoff-ineligible prefix: `H:C/acceptance-tests.json:L221-L222`.

### P1-3 — Non-blinded nonce and RPC-audit effects contradict each other

Three active rules require successful nonce consumption to write an audit row:

- All 31 granted RPCs write audit rows: `H:C/runtime-transaction-contract.md:L29-L31`.
- Each successful write RPC inserts exactly one audit row in its transaction: `H:C/storage-schema-contract.md:L67`.
- Nonce RPCs use disposition `consumed`: `H:C/postgres-type-contract.md:L73-L80`.

Other active rules require a later append failure to retain only the nonce and no RPC audit:

- `H:C/requirements.md:L208-L209`
- `H:C/auth-principal-contract.md:L78-L80`
- `H:C/acceptance-tests.json:L191-L192`
- `H:C/acceptance-tests.json:L221-L225`

There is also no exact nonce HTTP wire for source, price, instrument, or sector append operations. The exhaustive eleven human routes contain seven different non-blinded append routes, while the first seven ingestion RPCs require `opportunity_runner`: `H:C/auth-principal-contract.md:L53-L74`, `L92-L105`, `L130`.

No implementation can satisfy both durable-effect models. This is one cross-cutting P1.

### P1-4 — The mechanical active-version graph contains stale edges

The design declares normative conflicts Gate failures and requires `GOV-004` to reject stale references: `H:C/design.md:L24-L32`; `H:C/acceptance-tests.json:L227`.

Current active artifacts nevertheless contain:

- `trading-calendar-contract.md v3.3` in requirements versus active `tw-trading-calendar-v3.4`: `H:C/requirements.md:L104`; `H:C/trading-calendar-contract.md:L3`.
- `runtime-transaction-contract.md v3.7` in requirements and design versus active `opportunity-runtime-v3.8`: `H:C/requirements.md:L211`; `H:C/design.md:L216`; `H:C/runtime-transaction-contract.md:L3`.
- `source_dataset-v3.1` versus active `source-dataset-v3.2`: `H:C/source-matrix.md:L45`; `H:C/manifest-storage-contract.md:L21`.

Therefore `GOV-004` must fail against the current normative bytes.

## Round 29 closure table

| Round 29 blocker | Round 30 result |
|---|---|
| Stock-price provider/correction/corporate-action/tie/cutoff/raw authority | **Not closed; partial.** Provider, exchange, correction, tie, cutoff, and per-stream raw behavior are specified. Corporate-action derivation remains open under P1-1. |
| Finite source and seven-authority histories | **Not closed.** Per-stream histories are capped at 64, but global enumeration across cutoff-ineligible keys remains unbounded under P1-2. |
| Artifact bounds/joined sort and z-score date/raw bounds | **Closed for the original blocker.** Artifact selection has 64-per-hash, 1,000-hash, raw 64,001, at-most-1,000-head sort bounds: `H:C/storage-schema-contract.md:L71-L73`. Z-scores freeze 512 dates and distinguish raw 32,768/32,769 from 60/252 output counts: `H:C/market-contract.md:L97`. |
| Constructible outcome conservation maximum | **Closed.** At most 504 input runs × four maturity buckets = 2,016 rows: `H:C/shadow-evaluation-contract.md:L26-L30`; `H:C/manifest-storage-contract.md:L29`; `H:C/acceptance-tests.json:L226`. |
| Mechanical active-version graph | **Not closed.** The oracle exists, but its current inputs contain the stale edges in P1-4. |

## Independent canonical checks

| Preimage | Rows | Canonical bytes | SHA-256 |
|---|---:|---:|---|
| `market-provider-field-allowlist-v3.2` | 18 | 1,645 | `fe78e0f8c5b0846f822f72c6b2356cac35ed5c00dd0bcd06f9a75b7c5b21d3f7` |
| `market-price-provider-allowlist-v3.0` | 2 exchanges | 161 | `b3e51c4782012a3dbcb5fafda46fa583aa61f0de5601d12699e27280b642df74` |

Both independently recomputed values match `H:C/market-contract.md:L15-L60`.

`staticIdentityMembers` parsed as 36 unique, ASCII-sorted members in this exact order (`H:C/runtime-transaction-contract.md:L110-L155`):

```text
acceptanceVersion
authoritySupersessionContractVersion
controlPlaneContractVersion
dataContractVersion
decisionContractVersion
detailContractVersion
entityLinkContractVersion
evaluationContractVersion
featureScoringContractVersion
financialInputContractVersion
instrumentRosterContractVersion
internalPrincipalContractVersion
jobGraphContractVersion
legacyCompatibilityContractVersion
manifestStorageContractVersion
marketContextContractVersion
moverAuditPriceContractVersion
portfolioContextContractVersion
postgresTypeContractVersion
priceProviderAllowlistHash
providerFieldAllowlistHash
publisherVerificationPolicyHash
runtimeContractVersion
sectorBenchmarkContractVersion
sectorCycleContractVersion
sectorReferenceContractVersion
sectorTaxonomyContractVersion
sourceAdapterContractVersion
sourceAdapterRegistryHash
sourceDatasetContractVersion
sourceFunnelContractVersion
sourceFunnelPolicyHash
storageContractVersion
taxonomyMapHash
tradingCalendarContractVersion
valuationContractVersion
```

Acceptance inventory proof:

- Version: `1.29.0`
- Declared/actual/unique JSON cases: `223/223/223`
- Every JSON case has exactly the ordered fields `id, requirement, layer, setup, expected`.
- Markdown case rows: 223.
- JSON-only IDs: 0.
- Markdown-only IDs: 0.
- Order or semantic mirror mismatches: 0.

See `H:C/acceptance-tests.json:L1-L5`, `H:C/acceptance-tests.md:L1-L5`, and `H:C/acceptance-tests.json:L228`.

The inventory is structurally one-to-one, but exact executable semantic coverage is not sufficient: `MKT-018`, `SRC-014`, and `AUTH-008` omit the missing authorities/bounds, while nonce-related cases contradict the RPC-audit contract and `GOV-004` fails on current bytes.

## Global cross-contract result

The source-led boundary remains closed: full-market data is limited to shallow context, reference, and mover audit rather than per-stock deep research (`H:C/requirements.md:L100-L110`).

The 31-function catalog, core run-key tuple, manifest price-hash propagation, job bootstrap/payload/successor protocol, normalized types, and `ENABLE RLS`/`NO FORCE` model otherwise align. Architecture Round 2’s three historical findings appear repaired. Architecture Round 1’s detail seam is also closed.

However, adjusted-price authority, bounded source/authority execution, nonce/request/durable-effect closure, and active-version identity remain materially ambiguous or contradictory.

**Formal result: Requirements Gate Round 30 `CHANGES_REQUIRED`, with `P0=0`, `P1=4`, `P2=0`. Architecture Gate remains locked.**

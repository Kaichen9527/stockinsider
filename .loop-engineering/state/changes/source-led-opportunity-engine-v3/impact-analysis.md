# Impact Analysis: source-led-opportunity-engine-v3

## Classification

This is a new, unreleased change that flows forward from three predecessor changes. It does not rewrite their release history. Their approved behavior remains regression evidence, but acceptance tests that only asserted field presence are invalid for V3 outcome claims.

| Predecessor | Durable state | V3 treatment |
|---|---|---|
| `improve-stock-discovery-pool` | verified, release not started | Preserve formal-gate safety; replace full-market-primary discovery with source-led discovery plus a non-promoting missed-source audit. |
| `actionable-entry-revaluation-broker-upgrade` | deployed | Preserve explicit entry triggers, small starter positions, revaluation SLA and broker evidence labels. |
| `market-aware-valuation-entry-discovery-upgrade` | release recommended | Preserve market-aware decisions and scenario separation; invalidate structural-only pool/action audits. |

## Why an Amendment Is Required

The earlier architecture assumed stronger discovery metadata and market inputs than the runtime actually supplies:

- Production sources can write hundreds of records while `discoveredStocks` remains empty.
- The local collector and fallback research universe are a fixed 30-stock list.
- `risk_on_can_attack` can be emitted while TAIEX, OTC, breadth and foreign-flow fields are all null.
- The valuation formula can amplify current high multiples and optimistic margins, yielding unverified 80%-220% upside.
- Existing audits pass when fields exist even if there are zero new candidates or no formal recommendation.
- The displayed ML forecast is a deterministic heuristic labeled `baseline-v0`, not a trained or calibrated model artifact.

## Amendment Decision

V3 SHALL NOT run deep research across every listed stock. The primary funnel SHALL start from approved discussion, research, official-event and broker sources. Only linked, eligible candidate symbols receive per-stock enrichment. Full-market data is limited to:

1. aggregate market and sector context;
2. liquidity and relative-rank reference data;
3. an after-close Top-20 missed-source audit whose symbols cannot become actionable without direct-source or verified fundamental evidence.

## Invalidated Assumptions and Tests

- `newCandidates24h === 0` with a prose `unchangedReason` is not freshness proof.
- A non-null `tradeDecision` is not actionability proof.
- A non-null `marketIndexSignal` is not market-data completeness proof.
- A `valuationSanityStatus` field without formula invariants or forecast outcomes is not valuation calibration proof.
- Source activity counts do not prove symbol extraction, cross-source deduplication or candidate creation.

All V3 acceptance cases must bind input fixtures to observable outputs and negative invariants. Old audits remain regression checks only.

## Affected Surfaces

- Pre-truncation immutable source-revision adapters, source normalization and stock entity linking.
- Candidate scoring and bounded enrichment orchestration.
- Market snapshot completeness and regime derivation.
- Valuation scenario construction and forecast calibration.
- Independent same-run V3 radar/detail public projections and homepage ranking; legacy deep-dive remains isolated.
- Additive authority/observation/manifests, durable opportunity-run jobs, score and outcome history.
- Offline assistive-model evaluation; no model enters the authoritative decision path in this checkpoint.
- Local Loop `model_runner_v3` planning/implementation support under the macOS custom permission profile; model command descendants can read only the bounded sanitized view/hash-bound prompts/minimal runtime, while review/verify/repair views are materialized from the exact proven proposal commit rather than receiving hashes alone. Descendants write only private scratch, inherit no auth/transport descriptor and use no command network. Durable pre-`prepared` resource reservations give every setup attempt a unique identity-bound immutable key without consuming the operation round; every durable record carries the same runner identity, and cleanup failure has one byte-exact exit-11 recovery output that retains the primary evidence. This is development tooling, not a production opportunity worker.

## Migration and Operations Impact

- Design permits only additive tables/indexes; applying any migration remains a later explicit checkpoint.
- V3 pipeline control maps legacy internal auth alone only to a fixed non-human runner; every human-authority write composes that governing `requireInternalAuth()` guard with the independently signed role-bound principal in `auth-principal-contract.md`.
- V3 database access requires a separate service-role client with no anon fallback, and one Vercel request performs at most one durable job.
- Existing `.env*`, production schedules and deployed schemas remain unchanged during architecture work.
- No new production dependency is approved by this amendment.
- Runner implementation uses Node built-ins, existing `yaml`, pinned `/usr/local/bin/node`, `/usr/bin/git` and the pinned ChatGPT Codex binary only. `model-runner-host-pins-v3.json` is the exact stat/hash/version/codesign oracle; an update fails closed until another compatibility amendment. Its sealed patch/result and any separately produced domain artifact have different authorities; the latter still requires signed human registration and remains `influence:none`.

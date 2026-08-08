# StockInsider Valuation Methodology

This document is the implementation contract for v5.18 valuation logic.

## Source Hierarchy

Base targets can be formal only when at least one verified external source supports the core bridge:

1. Official company/TWSE/MOPS financial data, monthly revenue, filings, or conference-call material.
2. Broker or foreign analyst public summaries, including FactSet consensus snippets, Cnyes foreign-rating pages, MoneyDJ/CMoney/news summaries, or imported broker PDF/CSV files.
3. Named supply-chain or reliable industry research.

Social/KOL/Threads/Telegram/YouTube/Podcast content can create discovery and scenario evidence, but cannot independently make a Base target formal.

## Forward P/E Bridge

Default PE target formula:

```text
Base target price = forward EPS × target forward P/E
```

Where:

- `forward EPS` must come from a broker/FactSet consensus, official guidance, or a fully cited financial bridge.
- `current forward P/E = current price / forward EPS`.
- `target forward P/E` must sit inside the peer range or have an explicit rerating reason from broker/official/industry evidence.

If forward EPS is missing, the report must mark the PE bridge as `missing_forward_eps` and Base cannot be a formal target.

## Peer Range

Peer range must be visible to the user:

- Low / midpoint / high PE where available.
- Adopted PE.
- Whether adopted PE is inside the range.
- If adopted PE is above the range, the report enters valuation review unless a broker or official rerating source explains why.

## Base vs Scenario

Base:

- Uses verified evidence only.
- May use research estimates only when they are anchored to official/broker/financial data.
- Cannot include unverified customer/order claims as a formal assumption.

Scenario:

- Can include unverified upside, but must show a checklist.
- Must list the trigger that would upgrade scenario evidence into Base evidence.
- Cannot be shown as a formal recommendation before gate checks pass.

## Review Flags

The system must show valuation review flags when:

- Base upside is greater than 30%.
- Scenario upside is greater than 100%.
- Target PE is above peer range.
- Forward EPS is missing.
- Key assumptions are internal-estimate only.

## Broker Consensus

Broker consensus is an evidence input, not a recommendation by itself. The system tracks:

- Source count.
- US broker count where detected.
- FactSet/consensus count where detected.
- Min/median/max target price.
- Latest report date and staleness.
- Forward EPS / year when available.

Public news snippets are labeled as `news_summary` or `broker_summary`; they are not treated as full reports.

## Model Boundary

Hugging Face models are assistive only:

- Extract symbols and themes.
- Classify sentiment.
- Score evidence strength.
- Summarize long documents.

Model output cannot directly promote a stock to formal recommendation.

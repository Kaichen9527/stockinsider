# Source Matrix: market-aware-valuation-entry-discovery-upgrade

## Market / Index Inputs

- TAIEX close, MA20, MA60, trend score.
- OTC close, MA20, MA60.
- Market breadth / advance-decline if available.
- Foreign flow 1/5/20 day if available.
- Theme heat and sector capital flow.

Use:

- Drive `MarketIndexSignal`.
- Adjust entry risk budget.
- Trigger market rerating review.

Do not use:

- Directly raise target price.

## Broker / Foreign Research Inputs

Priority sources:

- 鉅亨外資評等 / target price / EPS.
- 鉅亨 FactSet summary articles.
- MoneyDJ / UDN / CMoney broker adjustment summaries.
- Manual PDF/CSV imported broker reports.
- Threads / Instagram / PTT / Telegram broker leak mentions.

Broker keywords:

- Morgan Stanley, Goldman Sachs, JPMorgan, Citi, BofA, UBS, Bernstein, Jefferies, FactSet.
- 美系外資, 外資報告, 目標價, target price, EPS, forward EPS, rating, 調升, 調降.

Use:

- Verified public/imported broker evidence can support broker consensus.
- Social broker leaks can trigger revaluation jobs.

Do not use:

- Social broker leaks cannot be treated as verified broker consensus.

## Discovery Inputs

- Limit-up / near-limit-up.
- 3/5/10 day price strength.
- Volume spike / unusual volume.
- Strong sector/theme heat.
- PTT Stock post/push sentiment.
- Threads/Instagram account feed and public search.
- Telegram public channels.
- BullTalk / 股市爆料同學會.
- Global lead-lag baskets, including US/Japan/Korea same-theme peers.

Use:

- Add to discovered/watchlist/hot tracking.
- Trigger evidence search and revaluation.

Do not use:

- Do not promote to formal without Base bridge, valuation sanity, revaluation freshness, and entry gate.

## Valuation Inputs

Formal Base can use:

- monthly revenue,
- audited/official financials,
- forward EPS with source,
- target forward PE within peer/broker range,
- broker consensus,
- verified supply-chain/customer evidence,
- scenario promotion evidence.

Scenario can use:

- partially verified catalyst,
- market/sector rerating hypothesis,
- global peer lead-lag,
- broker/social leak as pending evidence,
- product mix/share assumptions with checklist.

ML/HF can use:

- sentiment,
- evidence strength,
- semantic clustering,
- auxiliary forecast band.

ML/HF cannot:

- directly produce formal Base/scenario target.

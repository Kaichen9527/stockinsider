# Research cycle agent (Mac Codex, not yet scheduled)

This runbook is for a future Mac Codex heartbeat after the independent Astra review. It does not authorize activating a schedule or promoting a strategy. The app uses one model job at a time, a 30-minute lease per attempt, at most four attempts (120 minutes) per Taiwan day, and at most five new deep-study jobs per Taiwan ISO week. The VPS may collect public evidence and compute deterministic outputs; authenticated social reading stays on the Mac. Never copy cookies, credentials, private posts, or member-only full text into the research store.

## Discovery (07:00 and 18:00 Asia/Taipei, including weekends)

1. Read official exchange/MOPS/company material first, then public news, industry, broker summaries, PTT, InvestAnchors, and available public social posts and replies. Search issuer names, symbols, products, customers, competitors, technologies, and newly discovered entities. Record the exact scope and outcome of each source attempt: success, no relevant result, or failure. A failed platform is missing evidence, never zero attention.
2. Preserve original publication time, first-observed time, canonical root URL, content hash, repost relationship, retraction, and contradiction. One rumor can enter the research queue, but cannot become an order or a base-case EPS assumption. Paid/private content may contribute a permitted summary to the private research ledger; it is never a public article citation.
3. Submit a guarded `research-priority-run` POST with source-attempt receipts and bounded ratings. Read the returned complete candidate dispositions and Top 20. Do not fill empty seats merely to reach 20. In-progress jobs retain their lane. Confirm the weekly five-job cap before claiming anything.

## Deep research and independent review

1. Claim one `research-deep-job` with a stable owner ID. Work only on the returned symbol and priority run; the lease is 30 minutes. A model timeout or offline state is a failed attempt, not a completed article. Do not replay a lost lease.
2. Gather issuer-specific evidence and construct the seven sections in `research-deep-article.ts`: market expectation, industry position, rumors/orders, earnings transmission, valuation, entry conditions, and next evidence. Cite every paragraph and catalyst. Each catalyst needs stage, earliest possible financial period, business affected, financial transmission, strongest counterevidence, and falsifier. Explain overseas substitutes through revenue share, margin, timing, or capex assumptions.
3. Reconcile the three-business baseline bridge (revenue, gross profit, expense, corporate, non-operating, tax, minority interest, shares) and separate reported one-offs from normalized EPS. For conditional commercialization, capacity × utilization × yield × ASP minus intragroup revenue must equal incremental external revenue; deduct opex, depreciation, tax, and ownership. Missing inputs mean no quantified target. Article text and all calculated figures come from the same immutable draft.
4. A separate reviewer identity and `RESEARCH_REVIEW_KEY` must read the exact source documents and article; it submits `research-deep-review` with findings for all seven sections. Only after an accepted independent review may the author submit the exact article hash through the existing dossier submission/outbox. Then finish the deep job with the accepted receipt ID. A rejected or expired lease remains visible and retry-bounded.
5. A second decision, `research-thesis-review`, determines qualification. Publication alone never qualifies new entries. A material denial or retraction must create a stale/invalidated successor through `research-thesis-event`. A no-change 30-day recheck adds a review receipt without changing the article hash.

## Technical monitoring and strategy research

After the official complete trading session is available, run `research-technical-snapshot` only for qualified research candidates and existing paper holdings. It binds article, thesis, market dataset, calendar, feature, and strategy versions. The initial deployment deliberately records raw breakout/pullback signals but blocks entry because liquidity auditing and exact strategy approval are not configured. An existing holding remains under its original risk rule even if the thesis is invalidated. Weekly bars use official Taiwan calendar weeks; source retraction blocks new entry research.

On Sundays, write one prespecified failure hypothesis and no more than three variants. Evaluate technical-only, technical+research, and technical+research+KOL arms with point-in-time source availability and costs. Preserve all failed trials. The 2024-onward holdout remains sealed until an independent validation run. Neither the strategy researcher nor article reviewer may approve a strategy. Exact code, parameters, and risk policy need an independent validation receipt and explicit user approval before adoption; do not use this runbook as approval.

## Operating gates

- Do not begin heavy history/backtest work when Contabo capacity guard or heavy-work lock blocks it. The 40 GB decimal StockInsider budget is subordinate to the whole-host free-space guard. Never delete historical prices, financials, source evidence, article revisions, or experiment results as an overflow response.
- Do not enable the paused AUO heartbeat, merge PR #284/#285, publish a new article, or change production strategies until gates pass and the requested Astra review is complete.
- Every run should record exact source scope, missing platforms, queue and article receipts, model minutes, and failures. Avoid routine notifications when nothing material changes.

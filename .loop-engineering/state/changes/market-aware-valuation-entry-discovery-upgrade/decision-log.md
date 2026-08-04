# Decision Log: market-aware-valuation-entry-discovery-upgrade

## D1: Market Rerating Can Trigger Revaluation, Not Auto-Raise Targets

Decision:

- A strong TAIEX/OTC market, sector rerating, or overseas peer rally can mark a target as potentially stale and raise revaluation priority.
- It cannot directly raise Base or scenario targets.

Reason:

- The user is right that old targets can become too low in a strong market.
- But raising a target only because price went up would break valuation auditability and could recommend already-overheated stocks.

Implementation implication:

- Add `marketValuationAdjustment` as a read-model explanation and repricing trigger.
- Keep target math tied to forward EPS, target forward PE, broker/official evidence, monthly revenue, margin/EPS bridge, or scenario promotion evidence.

## D2: Scenario Can Become Base Only With Evidence

Decision:

- If scenario checklist progress is high and the market is validating the theme, scenario should be reviewed for promotion to Base.
- Promotion requires external evidence, not only price action.

Evidence required:

- At least three scenario checklist groups with external refs, such as monthly revenue, EPS/margin, product mix/share, customer/order, broker target/EPS.
- Forward EPS or target forward PE must be traceable to broker/official/financial bridge.
- Valuation sanity must be normal.

Implementation implication:

- Add a status distinct from current `price_led_fundamentals_pending`:
  - `price_led_market_rerating_pending_evidence`
- Show required evidence and next search source on cards/deep-dives.

## D3: Entry Decisions Must Be Actionable Even When Conservative

Decision:

- `不買`, `等回測`, and `過熱不追` are valid only when paired with a concrete trigger:
  - buy zone,
  - breakout trigger,
  - pullback trigger,
  - stop loss,
  - position size after trigger,
  - invalidation.

Reason:

- The user needs to know when a stock becomes buyable.
- A conservative decision without a trigger is not useful.

Implementation implication:

- Radar cards must receive compact `tradeDecision`.
- Deep-dive first screen must show action + size + trigger + stop.
- Audits must fail if visible cards only show conservative words without actionable triggers or hard-block reasons.

## D4: Formal Recommendation Gate Stays Strict, Add Actionable Scenario Layer

Decision:

- Formal recommendation still requires complete Base bridge, valuation sanity, fresh revaluation, current price below Base, and entry gate.
- Scenario-only stocks can still have actionable non-formal trading plans.

Reason:

- This avoids pretending over-Base stocks are formal buys.
- It still lets users act on scenario setups with small position/risk controls.

Implementation implication:

- Use language like `非正式情境買點`, `小量追蹤`, `回測買點`, `突破追蹤`.
- Never label scenario-only as formal buy.

## D5: Discovery Must Surface Potential Before Full Verification

Decision:

- Market movers, limit-up/near-limit-up, broker leaks, social heat, PTT/Threads/Telegram/Instagram mentions, global lead-lag, and foreign broker summaries should enter discovery/hot tracking early.
- They cannot directly become formal recommendations.

Reason:

- The product goal is to find stocks before they are broadly discovered.
- Early discovery needs looser intake but strict promotion.

Implementation implication:

- Candidate/hot tracking should show why not formal and what evidence is missing.
- Broker social leak is a revaluation trigger, not verified consensus.

## D6: Homepage Market Analysis Must Be Decision-Oriented

Decision:

- Homepage market block should not only say `risk-on`.
- It must say what the market allows today:
  - buy size,
  - whether to chase or only pullback,
  - whether to reduce,
  - which buckets are actionable.

Implementation implication:

- Use `marketIndexSignal.riskBudget`, `entryBias`, `exitBias`, TAIEX/OTC state, breadth, and top themes.
- Cards should echo market decision through compact `tradeDecision.marketGateReason`.

## D7: Autonomous Continuation After Requirements Approval

Decision:

- Treat the user response `APPROVE REQUIREMENTS` plus explicit instruction to continue without waiting for more commands as approval to proceed through the already drafted design into implementation.
- Do not treat this as approval to deploy, merge, migrate, or modify secrets.

Reason:

- The change has a drafted design that directly implements the approved requirements.
- Stopping for a second gate would conflict with the user's explicit request to keep progressing.
- Release/deployment remains a separate gate under Loop policy and project rules.

Implementation implication:

- Update `status.json` to `requirementsStatus=approved`, `designStatus=approved`, and `implementationStatus=in_progress`.
- Record verification evidence before any release-stage state transition.

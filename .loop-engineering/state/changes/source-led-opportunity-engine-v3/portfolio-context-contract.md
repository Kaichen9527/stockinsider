# Portfolio Context Contract: source-led-opportunity-engine-v3

Version: `research-basket-v3.0`

StockInsider currently has no authenticated user-holdings source. V3 SHALL NOT infer personal positions from recommendation/strategy rows or present generic data as personalized advice.

The internal invariant/evaluation basket uses `research_basket_zero_start`: gross, stock and sector exposures start at zero for each enrich run. After all candidates receive provisional non-capacity decisions, order provisional `starter_now` before `event_starter`, then score descending, confidence descending, symbol ascending. Walk the order, applying `decision-contract.md` capacity and minimum-size rules against the allocations already accepted in this run. Continue until six successful actionable cards or no candidate remains; capacity failures become `avoid/capacity_exhausted`. Waiting/review/avoid cards reserve nothing. This proves the internal research basket jointly respects regime, 10% stock and 25% canonical-sector caps. Public compact/detail/workspace/homepage serializers receive only the sizing-omitted action decision and `decisionContext.mode='research_only'`; the old `research_basket_zero_start` context label and all exposure percentages are forbidden publicly.

For public context, existing-position action is exactly `no_position` with reason `portfolio_context_unavailable`; its internal null target is omitted rather than serialized. The pure decision module still implements and tests explicit holding snapshots for future authenticated use, but no personalized/existing-position result may be published until a later checkpoint defines holdings authority, tenant isolation and consent.

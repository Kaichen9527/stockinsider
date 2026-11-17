# Initial deterministic Launch Radar score rulebook

Authority: explicit user clarification permits a reasonable initial engineering rubric under approved parent#385. This supersedes the earlier null-only point-mapping plan, not any old published policy or qualification. Policy is `stockinsider-launch-radar-v1`; executable derivation version is `launch-radar-comparisons-v2`. The earlier `launch-score-unverified-assembly-v1` remains a separate diagnostic aggregation API and cannot supply this rulebook's actual component points.

## Fixed comparisons

Each comparison earns its listed weight when true,0 when known false, andnull when required operands are missing, unfinalized, incomparable or unavailable by cutoff. Comparisons use unrounded operands. `availableWeight` is the sum of the weights of known comparisons, including knownfalse/zero. `confirmedPoints` sums known points without renormalizing. A component score isnull until all its comparison weights are known; total score isnull until availableWeight100. Technical comprises25+25+20=70, chips20, market10. Scores are not probabilities. Missing fundamentals do not veto or redistribute these weights.

| Component | Comparison | Points |
| --- | --- | ---: |
| Trend/RS | Current close>MA50 |5 |
| Trend/RS | MA50>MA200 |5 |
| Trend/RS | MA200[t]>MA200[t-5], requiring205 contiguous selected closes |5 |
| Trend/RS | Stock20-session return>same-market20-session index return |5 |
| Trend/RS | Stock63-session return>same-market63-session index return |5 |
| Consolidation | `(prior25High-prior25Low)/prior25High <=0.15` |10 |
| Consolidation | `abs(prior25High-currentClose)/prior25High <=0.05` |5 |
| Consolidation | Prior WilderATR5/ATR20<=0.8 |5 |
| Consolidation | Recent5/prior20 mean share-volume<=0.8 |5 |
| Breakout/hold | Current volume-confirmed breakout OR qualifying fixed-original closing hold; one maximum award |20 |
| Chips | Foreign5-session net shares>0 |5 |
| Chips | Foreign20-session net shares>0 |5 |
| Chips | Investment-trust5-session net shares>0 |5 |
| Chips | Investment-trust20-session net shares>0 |5 |
| Market | Same-market index close>its MA50 |5 |
| Market | Same-market index close>its MA200 |5 |

Close>MA200 remains raw context and earns no additional award: close>MA50 combined with MA50>MA200 already implies it. Breakout and hold share one20-point predicate; their overlap cannot earn40. The chip5/20 timescales are explicitly separate specified comparisons. Known comparisons may receive partial weight within a component; a missing RS comparison does not erase already known MA comparisons.

## Price, source and session semantics

The selected-read consumer reuses existing official price/action/calendar selection and the240-bar minimum. It recomputes T06 arithmetic inside the scorer from the selected raw history/calendar/share-volume evidence, using the existing `launchPatternFixture`. It compares the supplied observation packet to that fresh result and closes scoring on mismatch. Matching revision labels cannot make a forged range, ATR ratio, breakout flag or current close earn points. Existing source revision/cutoff/action/availability gaps remain, and no new authority is created by source-shaped rows.

All MAs are simple averages of complete contiguous selected closes through current. MA200[t-5] is the200-bar window ending exactly five official selected sessions earlier. Price return20/63 is `currentClose/close[t-N]-1` and requires21/64 aligned completed sessions. Index inputs must name the same market/provider, exact cutoff and immutable revision, official source URL/reference and source/availability clocks. Every consumed index session must align to the selected calendar; source time must follow its official close and availability must follow source time and precede both revision availability and cutoff. Each index MA/return has its own full window; missing MA200 does not erase a known MA50.

Relative strength and the63-session tie key are arithmetic excess return: `stockReturnN-indexReturnN`. No percentile, ratio normalization or probability is inferred. Sort uses total score, then technical score, then63-session excess return, then symbol. Missing required tie operands produce explicitly unresolved presentation, never zero imputation or an official rank.

Prior25/prior50 breakout baselines exclude current. Breakout is strict close>prior25High and current/prior50 mean volume>=1.4. The prior ATR observation ends at t-1 with the existing Wilder seed/recurrence. Volume contraction uses disjoint recent5[t-4..t] and previous20[t-24..t-5]. Exact selected share-volume evidence must cover every consumed session; price adjustment is never treated as share adjustment.

The fixed closing-hold choice requires a verified original volume-confirmed breakout, unchanged price/action scale, fixed original level and all following closes>=that level at sessions1–5. Session0 is not a held follow-up. Low wicks do not change this chosen closing criterion. A false current breakout plus unproven hold remainsnull; either knowntrue alternative earns the single20 points. The present read helper only proves the current51-bar share-volume window. An original breakout1–5 sessions earlier needs52–56 sessions through current, so this slice **does not widen that proof** and does not claim positive connected hold evidence. Missing original-window share/action/event/scale evidence remains an explicit gap. A knowntrue current breakout can independently establish the OR predicate; original publication/formal review still remains unverified.

## Chip and market inputs

Chip input is an exact20-session aligned raw series for the same symbol/market, with official provider/source/revision/finality clocks and explicit net-share and price-volume `shares` units. It binds the selected price, calendar and comparable-share-volume revisions. Daily net and volume shares must be safe integers, volume must be nonnegative, and each institution's absolute daily net cannot exceed that day's same-scope volume; otherwise the relevant comparison isnull. Each5/20 sign comparison requires all relevant net observations and a known nonzero sum of same-unit share volume; retain net shares, volume shares and net/volume ratio as operands. Missing net values, fractional/impossible shares, lots/unknown units, zero denominator, action ambiguity, source/cutoff mismatch or unavailable clocks preserve null. No estimated chip flow or risk proxy may substitute. The actual selected reader currently supplies no chip/index producer; optional typed evidence is arithmetic input, not proof of external acquisition or official permissions.

Market points require the actual same-market index close and its own50/200 closes under that explicit index protocol. Old shared risk labels, foreign-market proxies and company-price trends are not market operands.

## Consumer and gates

`readLaunchPatterns` calls the real selected-read path and returns `launchScore` computed by this rulebook. `launchRuleScorePage` presents up to20 evaluated rows in stable pages of1–10, with source/version/cutoff-bound cursors and explicit unresolved ties. It checks the exact canonical16 IDs/groups/weights and independently recomputes component, overall and technical70 arithmetic before comparing any sort key; modified or nonfinite technical totals cannot change order. The63-session tie key is also recomputed from that canonical rule's finite stock/market return operands, with exact excess-return/null and predicate consistency; changing only the top-level tie value cannot reorder the page. It does not publish an official Top10 or admit candidates. Synthetic full100-point and knownzero/partial datasets test arithmetic; they are not acquired-source, review or real-session acceptance.

All score outputs retain false source/entry/ranking/publication authority, false rankability and `probability:false`. Numeric availableWeight100 is necessary arithmetic completeness and cannot substitute for actual source provenance, independent formal review, qualification, writer/ledger/RLS, immutable publication, A1/protected review, native HOLD or release gates. This source slice authorizes no SQL, provider/paid call, credentials, production operation, commit or deployment.

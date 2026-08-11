# Fresh Requirements Gate Review — Round 127

Subject commit: `5829f2e3d6413230b00fc9988f929d2254d577c1`
Subject tree: `025e15c4c2dc5dda9ed1aa2910a42c7479133f43`
Predecessor commit: `994f29af53eefd854d395b5fd346dcf02b0c5ddd`
Baseline tree: `c8880d15adb87d40ae32773ab87bd4cb9ccf1f8f`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=2`, `P2=0`)

## P1 findings

1. `entryPlan` was not a closed state-specific union. Runtime, Web and SQL accepted
   numeric or arbitrary trigger kinds, wrong trigger/state combinations and a trigger
   on `invalidated` decisions.
2. Conditional relative valuation retained only mutable multiples and counts. A caller
   could alter the current/reference multiples and membership counts, recompute all
   derived display values and canonical hashes, and publish a self-consistent
   `research_starter` that was not bound to the cutoff-resolved official rows.

Round 126 exact raw-threshold and missing quality/market repairs were confirmed closed.
Earlier freshness, FULL/LIGHT, exact revision, cited brief, source conservation and
valuation-plane roots remained closed. Architecture remained blocked. The reviewer
performed no repository write, network, production or deployment operation.

# Fresh Requirements Gate Review — Round 105

Subject commit: `9ec6c19e22ff09e9f43fbfec5ad04f3a14c4639f`
Subject tree: `6eaee4e1caba5056884281ffa1cc644c010c3de0`
Baseline: `1b714a4303c2a97ebb913dced8d9d607a4ac8951`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=8`, `P2=0`)

Canonical inventory literals and the DI-008 parser → completion → persistence →
122-session adjusted-read chain are closed. Architecture review did not begin.

## P1 findings

1. Evaluation heartbeat still changes material identity because cutoff-derived timestamps
   enter valuation/technical material and every run claims `factor_correctness_changed`.
2. PB persistence conflicts with the active PE-only storage/type/principal contracts and
   bypasses a typed audited append authority.
3. NAV/EV history repeats a cutoff-wide maximum across price sessions and counts rows
   rather than 252 distinct point-in-time sessions.
4. Source rejected/deferred document terminals are fixture-created rather than reachable
   from production acquisition, while entity candidates are silently truncated.
5. `decisionRevisionId` omits symbol, analysis revision, brief and provenance; detail scans
   recent projections instead of selecting one checksum-unique immutable revision.
6. Production creates generic thesis/risk filler and can publish newly recomputed prose
   under a retained unchanged revision.
7. The official statement parser aliases basic EPS to diluted EPS and derives diluted
   shares from it.
8. `stale_readonly` cards retain buy-like section placement and exact-revision detail can
   render the historical buy action without readonly classification.

All eight findings are release blockers. Repair must create a new immutable tree and
fresh Requirements review; Architecture remains prohibited until Requirements PASS.

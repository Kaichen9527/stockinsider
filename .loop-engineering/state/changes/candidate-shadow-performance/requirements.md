# Candidate Research, Shadow, and Public Snapshot Requirements

Status: approved by the user on 2026-08-31.

## Requirements

- Every valid stock mention available in the latest seven days SHALL appear in `found`, even when it is a single or negative mention.
- Candidate research SHALL run independently of `story_candidates` and SHALL persist per-stock price, technical, fundamental, valuation, classification, and terminal outcomes.
- Missing evidence SHALL keep a candidate in `found`; it SHALL NOT produce a synthetic valuation or actionable signal.
- Waiting and actionable thresholds SHALL remain the approved source-ranking-v2 thresholds.
- Actionable promotion SHALL require two adjacent, distinct official TW trading sessions. Same-session reruns and non-trading days SHALL not advance the streak.
- The public 30-session shadow counter SHALL count only real qualifying trading sessions and SHALL never count historical backtests.
- Public homepage and Radar requests SHALL read a last-good published snapshot instead of assembling the live data plane on every request.
- VPS systemd SHALL be the sole production write scheduler. GitHub workflows SHALL remain manual-only and Threads SHALL remain out of scope.

## Acceptance

- Recent source mentions remain visible with explicit missing conditions.
- Research failures are isolated per stock and observable in a run ledger.
- Shadow progress is reproducible, idempotent per session, and starts from real observations only.
- Warm VPS loopback TTFB is at most one second and external warm TTFB is at most two seconds.
- The migration is additive and preserves existing source, recommendation, V3, and historical rows.

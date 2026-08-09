# Exact-Commit Diff Review and Repair Closure — V3.12

Date: 2026-08-09
Reviewer: Codex pre-landing review

## Exact implementation review

- Parent: `15553f795d06c5d57ec90ef816c5f5cea41a8608`
- Exact implementation commit/tree: `87ae1fa5a40897d1d8dd0286a0e4d814fe45fe54` / `39a198af87b7e4af22129e5d8fa59e9c5724e44a`
- Reviewed range: `15553f795d06c5d57ec90ef816c5f5cea41a8608..87ae1fa5a40897d1d8dd0286a0e4d814fe45fe54`
- Verdict: `CHANGES_REQUIRED`, `P0=0 P1=4 P2=1`

Findings:

1. `P1` — sector PE was derived from the bounded candidate pool rather than the full
   effective sector roster; append-only instrument precedence was not explicit.
2. `P1` — one official endpoint rejection discarded otherwise valid official facts.
3. `P1` — the card did not expose the exact exchange and as-of dates behind PE.
4. `P1` — low-score reclaim cards could be labeled watchable, and `avoid` cards could
   appear in the best-research lane.
5. `P2` — Loop status recorded a future update timestamp.

## Repair closure

- Repair commit/tree: `fca7063442a5ea65b9bd6280837db1f9cc27fcbc` / `376d4cb5835af9f611dc6c62131dca4d41f9f4ab`
- Repair range: `87ae1fa5a40897d1d8dd0286a0e4d814fe45fe54..fca7063442a5ea65b9bd6280837db1f9cc27fcbc`
- Full final range: `15553f795d06c5d57ec90ef816c5f5cea41a8608..fca7063442a5ea65b9bd6280837db1f9cc27fcbc`
- Repair-range verdict: `PASS P0=0 P1=0 P2=0`
- Full-range verdict: `PASS P0=0 P1=0 P2=0`

The repair and full ranges were reviewed read-only. Both pass whitespace/error checks;
neither contains destructive SQL, secrets, dependency trees, build output or runtime
environment artifacts. Applied SQL, partial-feed, ranking precedence, exact exchange
provenance, payload-boundary and UI tests cover every finding.

## Verification boundary

Product/runtime and model-runner Code tracks pass. Evaluation governance remains the
typed elapsed-time blocker and therefore V3 Promotion remains prohibited. This review
authorizes the reviewed legacy producer/Web correctness release, not synthetic cohort
creation or V3 ranking influence.


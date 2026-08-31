# Candidate Research, Shadow, and Public Snapshot Design

Status: approved by the user on 2026-08-31.

## Data flow

1. Source sync writes normalized mentions.
2. Candidate research unions seven-day mentions, prior waiting/actionable rows, and the existing seed universe.
3. Each stock is enriched independently from official TWSE/TPEx/MOPS-compatible inputs and classified with source-ranking-v2.
4. A canonical per-session shadow observation records the immutable classification hash and quality blockers.
5. The producer builds a compact public Radar payload and appends a last-good snapshot.
6. Homepage and public API read one snapshot row with ETag and short stale-while-revalidate caching.

## Safety boundaries

- Legacy theme/story/report processing remains available but is non-critical to the candidate funnel.
- Publication failure blocks new actionable authority while retaining the previous last-good snapshot.
- Same-session classification changes create a shadow conflict instead of overwriting evidence.
- Threads is neither scheduled nor considered by source-health/shadow readiness in this change.

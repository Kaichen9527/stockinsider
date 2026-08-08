# Requirements Review — Round 50

Date: 2026-07-26
Immutable tree: `8fa4d2e68f28fd098b25899a86df55e9b6f3e689`
Base: `1fe429d3a91359cd2d6d07c89441ebb66d9ccc5d`
Verdict: `CHANGES_REQUIRED`
Counts: `P0=5 P1=2 P2=1`

This was a fresh read-only Sol xhigh review of only the named immutable tree. It did not inspect or inherit later worktree repairs.

## Findings

1. `P0` — Transcript content identity used `transcript_segments` as the canonical field key instead of normative `transcript`.
2. `P0` — Claim and mention overflow silently truncated at 200/1,000 instead of terminating the document as `parse_failure` with zero claims and mentions.
3. `P0` — PostgreSQL claim deduplication crossed run boundaries and selected canonical priors by run/revision rather than effective time, canonical document ID and claim ordinal.
4. `P0` — Blinded assignment returned flat snake-case database rows and unconditionally exposed reviewer-pair values.
5. `P0` — The required product suite was red and acceptance evidence lacked transcript, overflow, nonempty worker-to-PostgreSQL and blinded-state scenarios.
6. `P1` — Analyst estimates and broker targets shared one `LIMIT 101` rather than independent family bounds.
7. `P1` — Successful blinded assignments committed a nonce but no required assignment audit.
8. `P2` — Two task-ledger entries still described acceptance classification as incomplete.

## Confirmed closures

- Active job graph `v3.10`, acceptance `1.42.0`, host pin `v3.4` and the 266-row registry remained synchronized.
- Canonical trace inventory passed `130/130`.
- The applied migration suite passed its then-current `13/13`.
- Run-bound source-identity inputs were present.
- Missing real elapsed cohorts were correctly excluded from Requirements findings and remain an honest Verification blocker.

Architecture remained locked. Every repair requires a new immutable tree and a brand-new Requirements review.

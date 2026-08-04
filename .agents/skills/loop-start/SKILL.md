---
name: loop-start
description: Loop Engineering workflow command: loop-start. Invoke explicitly as `$loop-start`.
---

Start a greenfield product or first vertical slice from $ARGUMENTS.

Workflow:
1. Discover users, problem, journeys, constraints, non-goals, failures, security and success measures. Ask one high-impact question at a time.
2. Before approval, do not write production code.
3. Produce requirement draft and fresh requirements review.
4. Stop for exact human response `APPROVE REQUIREMENTS`.
5. Write Spec Kit spec/clarify/checklist artifacts.
6. Produce 2-3 architecture options, plan, ADRs, tasks and fresh architecture review.
7. Stop for `APPROVE DESIGN`.
8. Create acceptance-test plan and RED evidence.
9. Return FEATURE_ID and next command `loop-run FEATURE_ID`.


Always read `.loop-engineering/profile.json`, policy, Constitution and active Spec Kit artifacts. Persist state under `.loop-engineering/state/`.

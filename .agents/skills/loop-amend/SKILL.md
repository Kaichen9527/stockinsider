---
name: loop-amend
description: Loop Engineering workflow command: loop-amend. Invoke explicitly as `$loop-amend`.
---

Amend requirements for $ARGUMENTS.

1. Freeze any active runner.
2. Classify active/unreleased, released flow-forward, defect against existing spec, or unspecified behavior.
3. Produce impact analysis before edits.
4. Update spec before plan/tasks/tests.
5. Mark invalidated work and never silently reuse stale acceptance tests.
6. Run fresh requirements and architecture checks.
7. Stop for exact response `APPROVE CHANGE`.
8. Return the feature id and next command loop-run.


Always read `.loop-engineering/profile.json`, policy, Constitution and active Spec Kit artifacts. Persist state under `.loop-engineering/state/`.

---
name: loop-run
description: Loop Engineering workflow command: loop-run. Invoke explicitly as `$loop-run`.
---

Run all approved pending tasks for $ARGUMENTS.

Default mode is ALL, not one task.

Preconditions: Requirements and Design Gates approved; spec, plan and tasks exist; no blocker decision.

For every ready task in dependency order:
1. Create or resume isolated feature worktree.
2. Run baseline and prove RED when applicable.
3. Use Superpowers methodology for plan execution, TDD and systematic debugging.
4. Make the smallest coherent change.
5. Run targeted tests and verify-fast.
6. Invoke fresh spec-compliance and code-quality checkers; security checker when risk requires.
7. Correct evidence-backed findings.
8. Record evidence and checkpoint commit.
9. Continue automatically to next ready task.

Stop on policy conditions in `.loop-engineering/policy.yaml`. Never merge or deploy. Final result must be READY_FOR_FULL_VERIFICATION, NEEDS_HUMAN, or FAILED_WITH_ACTIONABLE_FINDINGS.


Always read `.loop-engineering/profile.json`, policy, Constitution and active Spec Kit artifacts. Persist state under `.loop-engineering/state/`.

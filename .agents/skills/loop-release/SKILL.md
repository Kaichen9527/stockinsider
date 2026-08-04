---
name: loop-release
description: Loop Engineering workflow command: loop-release. Invoke explicitly as `$loop-release`.
---

Evaluate $ARGUMENTS for release without merging or deploying. Require full verification, security evidence, migration/rollback evidence, observability, UAT, known limitations and human approvals. Return RELEASE_RECOMMENDED, RELEASE_BLOCKED or NEEDS_HUMAN.


Always read `.loop-engineering/profile.json`, policy, Constitution and active Spec Kit artifacts. Persist state under `.loop-engineering/state/`.

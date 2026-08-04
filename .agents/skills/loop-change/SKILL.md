---
name: loop-change
description: Loop Engineering workflow command: loop-change. Invoke explicitly as `$loop-change`.
---

Start a new feature in an existing application from $ARGUMENTS.

Inspect affected current behavior first. Then follow the same Requirements Gate, Design Gate, acceptance-test and handoff process as loop-start. Do not refactor unrelated code.


Always read `.loop-engineering/profile.json`, policy, Constitution and active Spec Kit artifacts. Persist state under `.loop-engineering/state/`.

---
name: loop-verify
description: Loop Engineering workflow command: loop-verify. Invoke explicitly as `$loop-verify`.
---

Fully verify $ARGUMENTS.

Run Spec Kit consistency analysis, full build/lint/type/tests, integration/contract/E2E as applicable, migration and rollback checks, running-app verification, fresh diff/security reviews, traceability and evidence audit. Do not treat model confidence as evidence. Return PASS, FAIL_WITH_ACTIONABLE_FINDINGS or NEEDS_HUMAN.


Always read `.loop-engineering/profile.json`, policy, Constitution and active Spec Kit artifacts. Persist state under `.loop-engineering/state/`.

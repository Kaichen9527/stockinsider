# Minimal implementation plan

1. Add a pure typed draft builder using existing preparation, claim and article contracts.
2. Connect local draft and inspectDraft commands to the existing controller before authentication lookup; reuse its original claim-journal recovery.
3. Persist five immutable private files plus a last-written hashed commit marker. Verify semantic and byte integrity on restart; return current lease eligibility separately.
4. Exercise adversarial local synthetic cases, integration, typecheck, lint and normal web build in one isolated VM worktree using cached dependencies.
5. Commit sanitized validation and external preparation relay separately from draft artifacts. Open a draft PR for independent review. Formal handoff POST and production roundtrip are later work.

# Response-loss native source: response metadata normalization correction

Base `462aae78f3ade860b5d5eb49a094a3750c24dd4c`; original source `7eceacf9f5921d42ee30022b5174183b0df08b31` remains historical REQUEST_CHANGES. Root's R1 was a source-only normalization contract error, not a PG/socket/application failure. This successor changes only the native entry's one-line `storedResponse` helper and its one callsite, plus this handoff/evidence.

The actual candidate SQL at `migrations/20261014_research_versioned_input_candidate_v3.sql:95` returns `to_jsonb(saved)` plus status/replay/dispatchReady/**binding**. The first-seal return at line156 also appends binding. The prior helper stripped only the first three metadata keys, causing its persisted-row comparison to see an extra field. The stored database row must remain exact; adding binding to the stored expected row or ignoring arbitrary fields is not the correction.

The helper now accepts `expectedBinding`, destructures binding separately, asserts its full deep equality, and only then returns the row. The actual callsite passes `x.selected`, the existing complete known binding from `parseBindingCore` (`bindingCapsuleIdentity`, exact core, and registration). Missing/null/wrong/nested-incomplete/extra binding data rejects. No arbitrary filter or field allowlist is added. All other returned fields stay in the row, and the original `assert.deepEqual(...,stored)` and clock comparison remain. Product response validation, capsule identity, schemas and persisted hashes are unchanged.

## Executed scope

- Sealed original full native source before extracting the exact function. Builtins-only synthetic normalization positive against that original function reproduced exit1 with extra binding; stdout/stderr and source SHA remain preserved.
- Sealed corrected WIP before Node22.14 syntax and probes.
- One native-file syntax check: exit0.
- Thirteen exact-function normalization probe groups: PASS. Valid complete binding; wrong/missing/null/unknown-extra/incomplete binding; extra/missing persisted field; stored hash/clock drift; original status/replay/dispatchReady expectations. The probe verifies the real callsite still passes `x.selected` and retains the full stored-row comparison.
- The function is extracted verbatim as one source line and evaluated with only Node's builtin assert in the same realm. No native entry or app module is imported. Fixture records are clearly synthetic; these probes do not claim a real PG payload, binding registration, schema or transport validation.

## Not executed / unchanged

Both response-loss children (AUO currentv3 and EMC compatiblev2) plus their parent remain **NOT_RUN**. No socket/server/PG, previous native/pure matrix, build, npm, browser, HTTP, CI, production or VPS action occurred. Relay/parser, legal fixture, controller, SQL, roles/grants, binding/caps/limits, historical source and previous expectations are byte-unchanged. No source-execution fingerprint or approval artifact was regenerated.

Remaining: Root's independent delta review, separate heavy release, true held-successful-PG-response/observer COMMIT/zero-forwarded bytes, actual query rejection+socket cleanup, missing-root exact reconciliation and full native accounting. Whole application closure/four callers/Q-R/cash citations/formal author-review-publication and production readiness remain pending. This maker fix is not its own independent approval. Original high-bit parser RED and Root normalization R1 stay historical; neither is relabelled native PASS.

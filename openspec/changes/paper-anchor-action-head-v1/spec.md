# Use the verified anchor-session corporate-action head in paper sessions

## Defect / bounded scope

At7baa184, paper session loads and verifies latest cutoff-visible corporate-action snapshots/feed hashes/events, then independently queries any historical event for symbol/session with no exchange, cutoff or selected-head binding. A superseded or future event can incorrectly block a held book after a valid corrected zero-event head.

Reuse the existing authority loader's selected snapshot and validated events. Add a bounded nullable anchor action context to its result, present only after the complete existing history/feeds/hash/price/calendar checks succeed. Bind schema/status, symbol/exchange/session/cutoff, snapshot/session-authority IDs, dataset hash and source dataset revision; symbol-specific event is zero or one under the existing unique-symbol validation. It describes price-action evidence, not share/cash entitlements or a signed attestation.

Paper session must require a matching verified context, including a verified zero-event result. Remove only the unscoped second event query. A current selected event still blocks held positions for reconciliation and marks new-entry basis changed. Missing/ambiguous/stale-invalid/mismatched context fails before marking or saving a book; authority errors continue to fail closed. Do not add dividend/split/cash calculations, weaken volume-basis/official-history checks, rewrite old books or approve a strategy.

## Acceptance

- Superseded old event with latest valid zero-event head: corrected zero-event context and no false held-book block.
- Post-cutoff revision, another exchange and unselected snapshot do not affect anchor context.
- Latest selected event still rejects held-book processing, while current entry keeps entry-basis-change disposition.
- Missing feed, hash mismatch or ambiguous latest head yields null context and existing authority failure; route never appends a revision on failure.
- Route rejects missing context and wrong symbol/exchange/session/cutoff/revision; valid exact replay returns original receipt.
- Existing SQL/book, price adjustment and volume-basis expectations remain unchanged. No broad any-event query remains.

Root owns authority module/test, paper-session route/actual handler test and this scoped spec/handoff. Other workers own source/observed/priority/publication. Lightweight red→green locally, native VM/type/lint/normalbuild queued; independent exact-source review before enablement. Unsigned requirements/architecture review approved the preimplementation spec SHA256d9d69361500582a134274bd993de78a8d5b5d482b0b4799fb3653f64c4b8737f; no production mutation, model call, main merge or schedule activation.


## Implementation verification checkpoint

RecordedUTC: 2026-10-08T15:56:33.349620+00:00. Root implemented only the five owned files. Base7baa184 unchanged database migrations and original price/volume/book rules retained. Optionalnullable anchorAction is null on failed authority; verified event:null is distinct from unavailable. Context binds selectedhead and originalcutoff/revision, not caller prices or entitlement amounts.

Before authority implementation two new context tests failed0pass/2fail/0skip. The final actual-handler regression was replayed separately against exactbase route bytes and failed409vs200 because of the superseded historical event (1fail/0skip). Final15authority+5handler cases passed20/20zero skip on MacNode22.14. Handler tests execute realroute with explicitly synthetic dependencies; no realDB/HTTP/production data was exercised by them. Includes corrections/future/otherexchange, genuinecurrentevent held rejection/newentry block, missing/mismatched proof and noappend, exactreplay.

Existing CI already selects authority tests via test:tw-entry-plan and actualhandler via test:research-agents. Independent exact-source review, VM native integration/type/lint/normalbuild remain pending; no productionmigration/mainmerge/strategyapproval. Source/observed/priority/publication owners unaffected.

SourceSHA256:

```json
{
  "web/src/lib/tw-entry-plan-authority.ts": "711dc9c7da6dec9adb1f349ef9617494ef457f2d7ad1dd165adae49d5ed886e5",
  "web/src/lib/tw-entry-plan-authority.test.ts": "a0e856c473c01e7d0a551ff661f9a70c1933cca4e99b4194d66611b661d2543d",
  "web/src/app/api/internal/research-paper-session/route.ts": "102af9121f151747d620aadafe17dde781c1952f10c74aec0f03c59ee89c6c7b",
  "scripts/research-paper-session-route.test.mjs": "9e8a4fd1ccf2ed2e5ef46430ff88162979aab1340bc3bf0a7fa7b2d6aa7b97a3"
}
```

Private local test log SHA256 (raw logs not committed):

```json
{
  "/tmp/stockinsider-paper-anchor-authority-red.log": "c070d49e9ff6852907a473e898cf7d637dc0c6dda87cc86055a29fe02f37d9cf",
  "/tmp/stockinsider-paper-anchor-route-baseline-red.log": "d9a96110e494b5b7004a8a034dc8a2afcb4f02b77cd98f240d9fb710046175d0",
  "/tmp/stockinsider-paper-anchor-green.log": "ef1146a7ae4cadc091638cc5af8cd4814bfbe089fcde6b8239939f6c74169ff0"
}
```

## Independent review and release identity follow-up

Independent unsigned code review approved exact7a2a8df5d85c1f6061c8e3960b926b8574952552: independent20/20zero skip plus four isolation/failure probes; no new P1/P2. VM type/lint/build remain pending.

Ordinary CI run37804927182 failed at Taipei23:58: the same four positive-reservation cases in three existing PG suites encountered the legitimate late-day guard. It additionally exposed a stale generated execution-source identity after the two production-source edits. The supported generator now records only those two changed source hashes and their aggregate codeHash4ff97130999ee66808e05d1a253cece453141bc704c8050a581b955f4205e664. ParameterHash and all database policy entries are unchanged. Generator --check and release-identity test pass1/1zero skip. This refresh records source identity; it does not activate/approve a strategy or cure the independent clock-test issue. The generated file is a sixth scoped file added after the original five-file checkpoint.

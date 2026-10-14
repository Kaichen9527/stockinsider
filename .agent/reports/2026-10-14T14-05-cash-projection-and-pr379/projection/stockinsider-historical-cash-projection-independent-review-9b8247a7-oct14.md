# Historical cash byte projection: independent exact-source review

Active task: read-only review of source 9b8247a79f655f3e71905a1ecea4bb491305af79 against stacked base b7796da8a92b99284b133a7a622e490a23bad11b. After compaction reread /tmp/stockinsider-cash-projection-independent-task-oct14.md. Do not resume official-document automation.

## Verdict

**CHANGES REQUESTED: P0=0, P1=0, P2=1. No scoped CODE PASS.** The 11 existing tests pass, but a newly reproduced workload-bound defect remains in the current leaf. Full v3 integration and release are also pending for the separately documented reasons; they are not counted as new defects.

- Exact subject: 9b8247a79f655f3e71905a1ecea4bb491305af79
- Exact source tree: 60b455cdf7eb3f05a1515da722d21e025658e60e
- Approved stacked base / actual merge base: b7796da8a92b99284b133a7a622e490a23bad11b
- Worktree: /tmp/stockinsider-discovery-snapshot-root-review-oct14
- Final identity/check timestamp: 2026-10-14T06:12:20.334Z
- Range: seven files, 405 insertions, one deletion, one new binary fixture.
- Source was clean at start and after all probes. No source/index/untracked changes made.

This is an unsigned independent model-agent review, not a human/third-party signature, formal research reviewer execution, exact-approval attestation or authority to merge/deploy.

## Finding

### [P2] Reject an oversized Map before materializing all its entries

Confidence: 10/10. File: web/src/lib/research-historical-cash-projection.ts, lines 40–41.

Motivating current code:

```ts
const entries = [...Map.prototype.entries.call(files)] as Array<[unknown, unknown]>;
ensure(entries.length === selected.files.length);
```

The native Map/prototype checks at line38 do not bound its size. The spread therefore allocates and walks the complete caller-supplied Map before enforcing the fixed nine/seven-entry inventory. The only preceding deadline check is line37. A malformed arbitrarily large native Map incurs arbitrarily large synchronous enumeration/allocation before it is rejected; the cooperative deadline cannot interrupt this segment. This contradicts the handoff's finite count/workload claim even though no production caller currently uses the leaf and all qualification flags remain false.

I reproduced this on the exact source with a native Map containing 10,000 entries. A temporary observer wrapped the native Map iterator's next while preserving its original semantics, then restored it in finally. The result was historical_cash_projection_invalid, but only **after 10,001 native next calls and just one deadline.check call**. No file bytes were read or copied for this probe.

Recommended repair: read the native Map size through its intrinsic getter and reject any size other than selected.files.length before spreading/enumerating it. Alternatively, use bounded iteration that stops before materializing more than the permitted inventory. Add a regression proving over-limit input is rejected without full iteration, not merely asserting eventual throw. Keep the existing exact order/path/hash checks. No fix or test expectation was changed in this review.

## Scope and source-byte verification

I read every changed text file completely, the entire pins/projection implementation, the two workflow diffs and resulting arithmetic workflow, the full 11-case suite, handoff, and the decompressed fixture structure in memory. Private source lines and host paths were not dumped, served or uploaded.

I independently decoded all 15 unique fixture entries and retrieved each original byte sequence with git show at 15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb. Every decoded buffer was byte-equal to its actual original Git blob, with independently checked length and SHA256. Unique raw total: 931,660 bytes. Gzip: 202,500 bytes; expanded fixture JSON: 1,245,186 bytes; gzip SHA256 afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f. This is verification against retained Git bytes, not a new official-source or PDF acquisition.

For both companies I separately verified:

- every selected pin against the actual original byte sequence and exact 9/7 inventory;
- full model canonical hash after removing canonicalHash/inputManifest, and exact top-level/nested source manifest equality;
- all 85 paired facts / 170 numeric cells against the unchanged independent Decimal vector fixture, with identical periods, unit and consolidated flag;
- every selected reference's values, label, PDF page, source-line hash and packet/model pointer against both retained packet and model;
- all selected AUO capital values, including the null treasury-share count, against the existing vector;
- projection content hash via a separately implemented sorted-object JSON canonicalizer;
- absence of raw source-line strings, retainedPdfLocalPath, /Users/ host paths and other-company relay paths in selected output.

| Company | Files / input bytes | Facts / numeric cells | Output bytes | Deadline checkpoints |
| --- | ---: | ---: | ---: | ---: |
| 2409 | 9 / 697,558 | 52 / 104 | 52,077 | 67 |
| 2383 | 7 / 264,753 | 33 / 66 | 32,598 | 46 |

Independent output hashes:
- 2409: b59bd42321ac7e9af6c3fcd1eba86fa359f2537d467a45e8fbef244e442c434d
- 2383: a1965a0f56556c4c4b50f89f7f96ef263b6fd7b6aec529c919cce3b8bfa585d7

These are content hashes of an unsealed private projection, not execution closure, a prepared-input identity or publication qualification.

## Executed checks

On Node v22.14.0 I independently ran:

```sh
node --experimental-strip-types --test --test-concurrency=1 scripts/research-historical-cash-projection.test.mjs
git diff --check b7796da8a92b99284b133a7a622e490a23bad11b 9b8247a79f655f3e71905a1ecea4bb491305af79
```

Actual test result: 11 pass, zero fail/cancelled/skip/todo; diff check exit0. Experimental type-stripping and module-type warnings were retained; no package configuration was changed.

Additional read-only probes executed in this review:

1. The original-byte/numeric/reference/hash comparisons above passed.
2. **115 cleanup runs**: for each company, one success plus an exception injected at every successful deadline checkpoint. I temporarily observed native Uint8Array.set destinations, restored the intrinsic in finally and inspected all captured owned buffers after the call. All **852 owned copies were zero-filled**. Original caller buffers remained byte-identical on every normal/injected-exception call.
3. Two caller-mutation-after-copy probes zeroed caller buffers at the first parse checkpoint, after the full inventory had been copied. The resulting output hashes stayed identical to the baseline, confirming use of owned verified bytes.
4. Recursively checked every returned object/array is frozen and checked other-company relay paths are absent, for both companies.
5. The 10,000-entry Map probe reproduced the P2 above. Probe execution succeeded by observing the defect; it is not a passing boundedness acceptance result.

The maker's earlier 11-case run and strict module-only TS5.9.3/ES2017 check were read in raw/meta evidence. Direct Git comparison confirmed the four pins/projection/test/gzip blobs match pre-run ca2d10b79ea74b42ee57320ff0809c99c9df22d8; only workflows/handoff changed afterwards. I did not rerun module typecheck, parent14/94 checks, full app quality/build or native PostgreSQL. The maker's typecheck is supporting evidence, not relabeled as my execution.

One auxiliary read command hit zsh's no-match expansion on an unquoted historical Python-file glob. It did not run git grep, modify files or affect any numerical verification. The original source comparison used explicit fixture file paths and completed independently.

## Boundary analysis

Lines21–25 use a native typed-array byteLength getter and native set into a new Uint8Array; caller byteLength accessors cannot substitute a length. Each successful copied buffer is inserted into owned before hash validation, and line118 wipes owned buffers on success, hash rejection or later exception. The cleanup probes substantiate exception-path behavior; they do not prove cancellation of filesystem I/O or secure erasure of parsed JavaScript strings/objects.

Lines53–89 bind complete pinned model and packet bytes, manifests, clocks, facts, labels/pages/raw-line identity and AUO capital before calculation. The source extraction clock remains attributed to retained data; original model cutoff and Oct14 extraction are not collapsed into a backdated approval. Line91 invokes the unchanged parent calculation core. Two cumulative half-year flow rows remain separate from June30 instant capital/share locators. No standalone-Q2, EPS, diluted-share, October-share or current-valuation substitution was introduced.

Each company emits only its selected references/calculation. All source-publication/raw-PDF/filesystem-custody and financial/dispatch/research/strategy/publication flags remain false; inventoryBytesVerified only means the injected fixed files matched their pins. These flags appropriately limit the claim but do not excuse the P2 workload defect.

The semantic-mutation tests alter pinned raw bytes and are rejected by the earlier byte identity checks; they do not independently exercise every downstream semantic guard with a valid new pin set. This is acceptable for the closed exact profile but should not be described as generic parser/schema coverage.

## Workflow and inherited scope

The arithmetic workflow appends the new projection test to the existing literal core test command and adds three finite paths. Hosted runner, five-minute timeout, contents:read, pinned actions, Node22.14.0 and disabled persisted checkout credentials remain unchanged; no install, secrets, external writes or protected action added.

The product workflow adds exactly three positive source/test filters. Independently removing just those lines restores byte-identical parent workflow bytes, proving no change to its inherited jobs, permissions, commands or manual-only model/evaluation behavior. The existing fixture glob already covers the gzip fixture. No new CI result is inferred from those filters.

Only the seven listed files differ from base. Parent core/test/vector, SQL, authority, protected/oracle workflow, packages/locks, legacy reader and publication/API/UI paths are unchanged. No other team's work was touched.

## Deferred, not approved

The actual single-owner filesystem reader, O_NOFOLLOW/path-descriptor custody and slot cleanup, full scenario-plus-cash schema/mapping, old-v2 replay, shared quotas/fences, real IO cancellation, native HTTP/PG integration, new author/reviewer reservations and publication are not implemented by this leaf and receive no approval here. Injected deadline exceptions are not a real ten-second wall-clock or IO-cancellation test.

New-subject exact-lock application quality, ordinary/protected CI and release checks remain pending. No SSH/HTTP/VPS/queue/database/PG server/build/CI rerun/PR/ref/push/merge/deploy was used in this review. No attestation or signature was created.

The review skill's required .agents/skills/gstack/review/checklist.md is absent. Its workflow stops at that prerequisite; this report is the explicitly scoped read-only manual fallback, not completion of the full skill.

## Independently checked seven-file identities

| Path | Git blob | Bytes | SHA256 |
| --- | --- | ---: | --- |
| .github/workflows/research-historical-cash-quality.yml | 49910a2da7cdc0fd4e24e5ee16e2f6c0f9a247e1 | 1418 | 75dcf547dba1706ea22af0c5bf5286746c3cac7cbbd40ffcd1b636ee2d163bba |
| .github/workflows/source-led-opportunity-v3.yml | 2ba40a34f81f36add0beff5a18786fc2e1ed7972 | 6421 | b1b930edfb2bb746218bb6215c0a2ae8adc34eef2c5c3289fa61af44bb02bf2a |
| docs/operations/2026-10-14/historical-cash-projection-handoff.md | 5812f70a0e7f303d11591f1c7a6ea47b2ea8c29e | 4381 | 0dfd0e0e3a1e69cd7954bb846a3c60c4a7459640f012d0577a19f2f733fcf81d |
| scripts/fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz | 00d9e80495ddb25048925ecb00a758356494bb94 | 202500 | afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f |
| scripts/research-historical-cash-projection.test.mjs | 02e897b6f0eaef51e83e7fad27a117493edc74e0 | 7158 | 30125b883fde23b6f85371a236c8b374aa7d0fc05f0990a94efa6cb00f9a1102 |
| web/src/lib/research-historical-cash-pins.ts | 9bbeb18f6c5a70ec28193b29cebd9d477c9f1430 | 6778 | 0857d1b8b2e04fa9bedd9fcffbf072400d5ca51c0ac86b39a988bd6a1c442d41 |
| web/src/lib/research-historical-cash-projection.ts | 5a022aa99b7deab06f0ef8a5b687d14844986cd0 | 9699 | f7ec0b3d0be85f1d8fe9b111100a06157c1158223c9034f48a455d9341b51b0d |

Only this /tmp report was written. The new P2 must be addressed and independently rechecked before a clean scoped verdict.


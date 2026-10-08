# Private author draft and typed handoff

This isolated Cloud increment starts at 330c96b0c4068ba8cae7e94b657bb73aa9fb49d6. It consumes the original prepared input and claim journal, saves a private durable draft, and proposes the existing typed author handoff. It performs no HTTP request, model call, claim/reservation, approval or publication. Independent review remains pending under the amended GPT-6.1 Sol High maker / GPT-6 Astra High review split.

## Controller use

Use Node22 with the existing scripts/run-node22.js wrapper and --experimental-strip-types to invoke scripts/research-deep-controller.mjs. The local draft command accepts --origin, --owner, --request-journal, --prepared-input, --prepared-hash, --model-output and --output. All input paths are absolute, private regular files with a final newline. The output parent must be a private owned directory; the output itself must be absent or an identical committed artifact.

The model envelope is research-deep-model-draft-v1 with preparedReceiptHash, inputHash, exact job and modelReservation, and the existing article contract. A trusted controller/operator supplies --prepared-hash; a hash supplied solely by the model is not sufficient. No model authority, verified flags or invented citation IDs are accepted.

The output contains prepared-input.json, model-output.json, original-claim.jsonl, draft.json, handoff.json and commit.json (0600 in a 0700 directory). Files and directories are fsynced; commit.json is written last. Persist that commit receipt hash independently. inspectDraft --output ABSOLUTE_PATH --receipt-hash TRUSTED_HASH verifies all hashes and rebuilds the semantic artifact in a new process. It returns current lease status without mutating the receipt. A partial directory is retained and rejected; do not take it over. Use a new dedicated output only after diagnosing the original failure.

The preparation's 120-second freshness check runs at immutable preparedAt, not at article completion. Current eligibility uses the real current clock and both original deadlines. Expired or incomplete drafts cannot propose submission. Even an unexpired valid draft reports submissionEligible:false and requiresLiveStatusCheck:true: this increment has no authenticated live fence and cannot detect remote supersession/revocation by itself. handoffModel remains a proposal requiring the existing authenticated API and an independent budgeted review. No deadline or dataCutoff is rewritten.

## Evidence and limitations

The existing article validator checks structure, citations and financial arithmetic; it does not independently establish the truth of model assumptions. Preparation completeness, rights, gaps, original source versions and financial identity remain visible. Private summaries remain only in the archived prepared input; they are not turned into publishable evidence. This milestone is synthetic development acceptance, not company research or a production roundtrip. Fsync and restart inspection do not promise cross-task VM or volume persistence; power-loss testing was not performed. A same-UID hostile process able to rewrite private files and all trusted hashes is outside this artifact integrity boundary; protecting the independently retained receipt hash remains necessary.

Actual checks/resource measurements and code file hashes are recorded in .agent/reports/2026-10-08T063000Z-deep-private-draft-validation.json. The original worktree and earlier receipts are preserved. No migration, production gate, protected allowlist, scheduling or strategy setting is changed.

## Next-stage hosted reader relay

The sanitized relay is saved as deep-private-draft-public-preparation-relay.json beside this file. Acquisition was root-hosted-web-reader at 2026-10-08T06:26:50Z, not this VM HTTP controller. Supplied date precision and independence-root labels are preserved as relay labels, not fabricated database source IDs or wire hashes. Body reads, index reads, unusable PDF text and failed fetches remain distinct. It creates no official inbox, job or reservation and is not complete financial research. AUO and Intel material does not establish an Intel order. Full financial tables, eight quarters, 24 monthly revenues, nonoperating/one-off bridge, current customer/competitor/order checks, official price context and a second company remain outstanding.

## Delivery and review update

Draft PR [#304](https://github.com/Kaichen9527/stockinsider/pull/304) was created by the source thread using its existing local GitHub authorization, with base codex/financial-document-write-lease-oct08. The initial Cloud GraphQL Forbidden remains in the delivery history; no duplicate PR creation was retried. The existing independent Astra reviewer is assigned read-only review of exact code commit 06dc3cd41dd6d6ee64381c507ac15c60ca86229d. This documentation update changes no program code and performs no new VM validation or VPS operation. Await that review before continuing VM verification.

The confirming full research suite passed 342/342 with zero skips, including isolated PostgreSQL. The initial PATH exit127, temporary-directory du sampler failure and first integration result (341 pass, one PostgreSQL race assertion failure, zero skips) remain recorded. The unchanged suite passed on rerun; the intermittent race is not claimed fixed. Typecheck, lint and normal build results remain those of the original acceptance run.

Real company research, authenticated live-status checking and formal author handoff remain incomplete. Synthetic draft acceptance does not establish paid model work, independent review completion, publication, strategy approval or a production VPS→Cloud business roundtrip. The immutable acceptance receipt and hosted preparation relay are unchanged.

## Independent review: staged artifact integrity correction

Astra identified two genuine success-reporting defects in 06dc3cd: changing draft.json at before_commit could leave a committed manifest whose bytes failed immediate inspection; replacing the output directory after prepared-input.json could redirect later writes into a different inode. DF14 and DF15 both failed before the fix (0/2 pass, zero skip), with Missing expected rejection. The original private failure logs and their sanitized receipt hashes are retained. These attacks do not require changing the trusted input or receipt hashes and are inside the supported integrity boundary.

The writer now retains an open directory fd and verifies that the original pathname still names that exact private inode around operations. All artifact reads and exclusive writes use Linux /proc/self/fd directory-relative paths, so a rename cannot redirect a later file into the replacement directory. User-supplied fd/symlink paths remain rejected. This Linux backend requires accessible procfs; non-Linux compatibility has not been verified and there is no weaker path-only fallback.

After before_commit, every staged file must match both its original inode/ctime identity and intended bytes. The writer rereads files after the durable marker and applies the same on-disk manifest validation as restart inspection before reporting persisted. Inspection and duplicate reconstruction also retain the directory fd throughout their checks. Partial or altered artifacts are left intact and rejected, never overwritten or repaired into success. DF16 additionally rejects same-byte file replacement and restored-byte rewrites; DF17 proves post-marker corruption rejects both writer success and a new Node process inspection. Existing prepared clocks, lease rules, article validator and protected policy are unchanged.

The successor code and check/resource results are recorded in .agent/reports/2026-10-08T064500Z-deep-draft-integrity-validation.json. Further independent review remains pending; this correction does not approve publication or formal handoff.

## External evidence status reported by source thread

For old PR head 50d28efcaf179fa197bec2ce5c1a2e37dd6467f7, protected run 37739252502/bootstrap succeeded, while requirements/architecture/exact-review failed in prepare because refs/heads/evidence/source-led-opportunity-v3-exact-review-50d28efcaf179fa197bec2ce5c1a2e37dd6467f7 did not exist (remote ref not found). Product/model protected code gates had not run. This is source-thread-reported missing version-specific external review evidence, not a VM test or VPS capacity failure. No evidence ref or gate policy was fabricated/modified. It is not a conclusion about the successor head.

The source thread also reported a hosted-reader retry of 2Q26_Finance_Statement_English.pdf yielding four-page PDF metadata, but unusable text (dashes) and no observable screenshot pixels. This is appended in deep-private-draft-relay-followups.json; the original HTTP500 entry is preserved. It verifies no financial table or new number and is not a VM fetch. Actual VM PDF acquisition/rendering and nonoperating/tax/noncontrolling bridge verification remain next-stage research, alongside eight quarters and 24 months.

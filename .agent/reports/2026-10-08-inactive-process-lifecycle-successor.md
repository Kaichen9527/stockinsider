# Inactive process lifecycle successor — 2026-10-08

Implementation receipt only. Independent review, VM regression and protected registration
are pending. This is not signed approval, installation, live-oracle evidence or deployment.
Parent: `1afdd69bcc3bedbeae4151a56a7b372f64b3a58f` (frozen parser candidate).
Branch: `codex/astra-process-lifecycle-successor-oct08`.

## Root causes and bounded change

The prior executeModel used a combined 17 MiB counter, a 1 MiB decoded-character stderr
check, a 30-second idle timer reset by every chunk, no monotonic deadline recheck in
callbacks, direct SIGKILL and unbounded dependence on child close. These independently
rejected valid output or allowed trickle output/delayed callbacks/retained pipes to violate
section 9. No inference is made about the earlier unexplained CI status 1.

The new helper owns the detached spawn and uses independent stdout 16,777,216-byte and
stderr 8,388,608-byte limits. Only complete stdout LF lines renew the 300-second idle
limit. Absolute monotonic wall/idle deadlines are checked at data/exit/close and timer
callbacks. Production request timeLimitSeconds must equal the manifest-derived timeout.
Failure discards further output, signals only its still-live leader's own detached group
with TERM then at most five seconds later KILL, and disposes local pipes within a fixed
bound. Success needs matching zero exit/close, stdin completion, both natural EOFs,
no locked error/deadline, passing identity and the unchanged parser/result seals.

## Explicit ownership amendment and caller recovery

Node has no pidfd in this interface. After the ChildProcess leader exits, a numeric old
PID/PGID cannot prove ownership. The section 9 candidate amendment forbids signalling it.
Normal exit-before-EOF scheduling gets a bounded five-second drain; unresolved ownership
or forced disposal without confirmed exit/EOFs cannot publish or retry automatically.
The error is internally branded; executeOperation retains its live resource/reservation,
charged round and prior proposal, records terminal operation IO_ERROR/11, and persists
recovery_required. It does not write cleanup_started/cleanup_complete or invent exit.
The section 12 attempt classification adds ownership_lost in this inactive amendment,
avoiding the old eager exited label when no exit was observed. This is not evidence that
all descendants stopped, and no supervisor or trusted recovery command is introduced.

runner.js needs no modification: it delegates to executeOperation; existing terminal
failed/exit-11 replay refuses another model/attempt and keeps recovery_required. Two real
isolated Git fixtures verify persisted retries for leader-exited/held-pipe and unconfirmed
KILL cases: one spawn, zero cleanup, unchanged live resource/reservation/resource journal,
makeRound remains 1, repeated make rejects 11 and review rejects 8. The baseline 1af caller
fails this same test: its state returned to pending rather than recovery_required.

This amendment is an implementation proposal explicitly requiring another independent
reviewer. Root accepted the conservative ownership boundary for this inactive candidate;
that ordinary task authorization is not protected specification/installation approval.

## Verification actually executed

All commands used /usr/local/bin/node v22.14.0 on Mac; no real provider, auth read,
permission probe, pins change or credential access. Controlled child fixtures only execute
inline Node code supplied by the test. Their identities are test fixtures, not trusted hosts.

- Initial extraction of the old process loop, preserving its behavior: 14 cases,
  11 failures and 3 cancellations caused by its unresolved retained-pipe promise, 0 pass.
- Baseline parent execution.js + the caller ownership-loss regression: 1 test failed,
  confirming pending state instead of recovery_required. Source was restored afterward.
- Final `node --test --test-reporter=spec scripts/model-runner-v3/process-lifecycle.test.js scripts/model-runner-v3/jsonl-parser.test.js`:
  81 pass (31 lifecycle + unchanged parser 50), 0 fail, 0 cancelled, 0 skipped.
- `NO_LIVE_AUTH=1 node --test --test-name-pattern='pinned Codex JSONL parser|sealed terminal results|maker execution materializes' scripts/model-runner-v3/model-runner-v3.test.js`:
  three selected existing cases pass, including real temporary Git apply/replay/cleanup
  coverage. This is not the full original host suite.
- `node --check` execution/helper and `git diff --check`: pass.

Coverage includes exact/+1 byte bounds, approximately 12 MiB valid JSONL plus 8 MiB
stderr from an actual controlled Node child, actual one-second TERM timeout, deterministic
ignored-TERM/no-close KILL, retained pipes, monotonic clock regression/delayed timers,
partial/stdout/stderr activity, same-tick leader exit/KILL, EOF ordering, pipe errors,
late events, UTF-8 split across chunks, final identity checks, and persisted retry barriers.
The 300-second and five-second adversarial waits use an injected clock, not long sleeps.

## Exact source material

| File | SHA-256 |
| --- | --- |
| `scripts/model-runner-v3/execution.js` | `c3cb3273b9346fb33f998cf8b3b9bc0784e0525387b8e619fc0a9904858c1298` |
| `scripts/model-runner-v3/processLifecycle.js` | `68408b100e15ae54b5725645c7cc5a4579c222aa2dfcb0cc360f22bd9238ccd1` |
| `scripts/model-runner-v3/process-lifecycle.test.js` | `422f2e9443a71189988ec46658401e920719b9e7d9c0343c5ec479c0e996439a` |
| `.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-contract.md` | `9a7203a097b7d5b4f04b57bfa9dd1ed5c897daefad71b1277afd5582dc7bd00c` |

The commit/tree/listing are calculated after this receipt is committed. The unchanged
18-field static configuration identity is not an approval of these new source bytes.
Old e94d/1d92/1af packets and exact-source planners cannot authorize this successor.
Fresh exact-source review and installation facts must include the new helper and amended
contract. Existing owner grant, independent signed evidence, established registry,
predecessor CAS and trusted installation prerequisites remain unsatisfied here.

No protected selectors, host pins, authentication, registry, main, VPS or production were
changed. Full VM regression/type/lint/build and real protected host oracle remain external
verification steps. The original four Linux host/auth failures and original CI status 1
causality remain unresolved. No descendant-quiescence, release or plan-completion claim.

# Inactive JSONL parser successor — 2026-10-08

Status: implementation receipt, unsigned and not independently approved. No activation,
protected approval, installation, recovery grant, registry mutation or deployment occurred.

Base: `b1d96eb96156d3e1394615bb32c7a2d7ef90b661`.
Branch: `codex/astra-jsonl-parser-successor-oct08`.
The new commit/tree/listing must be taken from Git after committing this receipt; this
file does not claim a circular self-commit identity.

## Defect and bounded correction

The former `execution.js` parser accepted missing thread/turn starts, unknown events,
invalid UUID/usage/member shapes and multiple terminal agent messages. It also decoded
stdout with replacement before validating UTF-8. These failures violate the existing
`model-runner-contract.md` section 9; no new host authority is required to reject them.

`jsonlParser.js` now enforces a closed successful thread -> turn -> item lifecycle ->
completed turn, exact outer/inner/usage shapes, stable unique item IDs, one final sealed
agent result, typed terminal failures, raw UTF-8/NUL checks and the existing stdout byte,
line-byte and line-count limits. Command output remains diagnostic. Malformed protocol
returns the existing redacted exit 12; well-formed model failure returns exit 10.
The production caller supplies its exact operation; `sealResult` still subsequently
checks the actual expected request and source-view hashes, before apply/publication.

The existing real-model canary expects `{modelAttempt:"completed",operation}` rather
than a section 10 result. Its caller explicitly selects the closed diagnostic protocol
`model-runner-oracle-v2`; this accepts exactly those two fields with the requested
make/review/verify operation. The default parser accepts only `loop-model-result-v3.5`.
The oracle protocol is not a manifest/env switch, has no generic schema/validator hook,
is not selected by `executeOperation`, and cannot pass production result sealing.
No real-model attempt, permissions probe or authentication read was run for this fix.
This diagnostic selector is source code requiring independent review, not live-oracle
proof or an alternative approval route.

## Source identity

The existing section 5 static runner identity describes 18 configuration fields, not
source bytes, and is unchanged: `fdc18db72738748139bc457503b7541c5ba0daee306b1fda1525e038493d6a03`.
That configuration digest does not approve these new bytes. The host pins, fixture,
namespace, manifest, routing, trust registry and frozen recovery packets are unchanged.
Neither the e94d nor 1d92 packet/planner authorizes this successor. Any later recovery
must independently review and bind this new commit, tree, listing and runtime closure,
then satisfy the established external owner/three-review/registry/CAS/worker conditions.
Existing exact-source planners must continue rejecting this unregistered source.

| Source | SHA-256 |
| --- | --- |
| `scripts/model-runner-v3/execution.js` | `0652bc63a2231fc8241b0d3235f98fb7b620f05ee107874d2c917573014edda9` |
| `scripts/model-runner-v3/jsonlParser.js` | `ed19f2a8587478090d13650d09c011faaa0038fbdab54f0c22f082d70086447d` |
| `scripts/model-runner-v3/jsonl-parser.test.js` | `883809f4449cbc66f206afeafa51cef758fae770712c80b831103f5b794feaaa` |
| `scripts/model-runner-v3/real-model-attempt.js` | `82029f48fde51e6111aee0979ac861fce5d97f2b04a40c31d725c977e62f0add` |

## Actual lightweight verification

Executed on Mac using `/usr/local/bin/node` v22.14.0; no live Codex execution:

1. Before implementation, initial pure tests: 42 cases, 5 pass, 37 fail, 0 skipped,
   exit 1. This is the negative reproduction, not a successful acceptance run.
2. `node --test scripts/model-runner-v3/jsonl-parser.test.js`: 50 pass, 0 fail,
   0 skipped, including boundary/invalid-byte/failure/oracle/operation cases.
3. `NO_LIVE_AUTH=1 node --test --test-name-pattern='pinned Codex JSONL parser|sealed terminal results' scripts/model-runner-v3/model-runner-v3.test.js`:
   the two selected pre-existing cases pass, 0 fail. This selects two cases and does
   not represent the full original suite.
4. `node --check` on parser, execution and real-model-attempt: pass.
   `git diff --check`: pass.

The separate new test file must be included explicitly in the next VM regression;
this change does not alter protected worker selectors or claim the existing protected
suite automatically includes it. Full regression/type/lint/build are delegated to the
parent's VM queue. No protected acceptance or independent review has been produced.

## Known limits kept visible

The Linux original-suite failures (darwin/arm64 host fixture, unavailable live auth,
doctor status 1, real-worker status 1) are not fixed or waived. The earlier CI subprocess
status 1 has not been causally tied to this parser defect; original run/commit/stderr
are still needed. The native successor doctor test already positively selects v3.24
and negatively tests the obsolete v3.9 selector; it is not a stale-positive assertion.

Existing process-level section 9 deviations remain outside this parser slice:
`executeModel` uses a 30-second idle timeout, 17 MiB combined pipe counter, 1 MiB decoded
stderr check and immediate SIGKILL, while the normative contract specifies different
separate bounds/deadlines and TERM/grace/KILL handling. This receipt does not certify
those paths. Live emitted schemas and host identity still require the real protected
oracle, not synthetic parser input. External authenticated recovery entrypoint, owner
grant, three independent signed reviews, durable predecessor CAS and trusted installation
remain prerequisites; none is fabricated here.

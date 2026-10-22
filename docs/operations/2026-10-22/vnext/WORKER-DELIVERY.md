# Durable worker milestone — partial acceptance

Source/test head `b1cdca8e752edab4cfbef99b76a657ed7785621a`; worker product `984367556a83297b6763bd816830478aa1403395`, test correction `be66937d7081d35baedeec47e20a49a9af0160c8`. The base [delivery](DELIVERY.md) and its receipt remain an immutable earlier milestone, not the current feature-completion claim. PR384 remains draft.

The actual `automatic`/`recover` HTTP actions accept only a configured author credential and `jobId`. Server configuration and enabled private DB bindings select principals, provider, models, prompt versions and credential hashes. Provider requests use the fixed OpenAI Responses origin. No provider request was made during acceptance: all outputs were injected synthetic fixtures.

The new additive migration preserves original admission/fence bytes and stores frozen requests, raw and normalized outputs, response identities and terminal/uncertain state. Reservation precedes provider work. Distinct author/reviewer executions require independent stored results and original-evidence access before publication. A unique provider response ID cannot back two executions. Uncertain calls retain global capacity across dates; no automatic POST retry occurs. Known response recovery uses explicit lookup/READ; unknown response identity remains unresolved. Definite terminal failure consumes the existing attempt. Direct old submission commands cannot bypass the new journal after this migration is installed.

Only approved original official numeric financial facts currently cross the provider boundary. Arbitrary operator payloads, metadata, paid/member text and raw channel messages are not authorized model inputs. A separately guarded extraction-receipt extension is being implemented; it is **not covered by this receipt**. Unsupported number encodings fail closed without rounding. Schema/hash/evidence checks enforce a protocol and arithmetic, not truth of prose or actual semantic investment approval.

## Actual VM checks

| Run | Actual result |
|---|---|
| `worker-source-direct-01` | 8 individual pure contracts PASS; includes known response lookup/recovery and expired-execution behavior. Earlier `--test` runs emitted one file-level result each and are not counted as6/8 cases. |
| `worker-typecheck-01`, `worker-lint-01` | PASS; lint has33 inherited warnings. |
| `worker-native-01` | 3 PASS/2 FAIL. Genuine prefixes and both issuer components passed; new test expected a later guard while unchanged active-mode guard correctly rejected first. Original RED retained. |
| `worker-native-02` | 7 PASS including parent; real PG17.11/service_role/genuine prefixes. Four charged attempts, six synthetic provider invocations, two unqualified revisions. Actual query+ReadyI, duplicate provider identity23505 rejection, uncertain no-reinvoke, terminal failure, and exact rollback of seeded prior-session slot contention. Prior-session rows are synthetic transaction fixtures, not real cross-day provider execution. |
| `worker-build-01` | FAIL: sandbox child spawning EPERM caused empty TypeScript CLI output. Standalone same tsc produced valid JSON; a bounded elevated child probe succeeded. No dependency/config/product guard was changed. |
| `worker-build-elevated-01` | Full webpack build PASS on the same product source, under authorized VM child-process permissions. Earlier default Turbopack RED remains; default build on this new head awaits ordinary hosted CI. |
| `worker-browser-auth-01` | 12 desktop/mobile cases PASS, including actual automatic/recover auth/role/selector rejection with no provider credential and zero RPC work. Uses earlier persisted synthetic research snapshots. |
| `worker-public-read-01` | 1 PASS: actual read-only service_role RPC over retained worker-native-02 rows. Complete table hashes unchanged, no new model/receive/publish/claim. |
| `worker-browser-revision-02` | 2 desktop/mobile cases PASS: actual worker revision IDs, all10 full sections, ratio0.5, dates/history and unqualified state reach the isolated built UI. Chromium151, not the originally blocked pinned download. Initial unregistered-suite `No tests found` RED retained; only finite testMatch registration changed. |

The new native uses explicit synthetic preparation and writer-lease adapters. It does **not** reaccept actual financial acquisition, production writer/HBA/peer rights, live provider execution, original-content semantic support or formal publication. It does not prove real socket response loss; existing pure injected uncertainty is labelled accordingly.

Both new owned PG containers are stopped, backend/socket shutdown recorded, and all data retained. Loopback browser/server processes settled. No production operation, schedule resumption, cleanup, merge or deployment occurred. Filesystem floors remained8GiB; RSS figures are sampled. Raw rows/catalog/server logs/provider bodies/traces remain private. [Worker evidence](worker-evidence/summary.json) and [receipt](worker-evidence/receipt.json) publish only finite safe summaries/TAP/hashes/fixture screenshots. Private inventory is custody metadata, not independent contents approval.

## Continuing work

Permitted extraction/immutable rights receipts, frozen market AI, weekly substantive thesis/valuation checks and deep-score evidence population remain a separate active implementation slice. Actual two-postclose-session swaps, real sources/models, Contabo isolation, broader legacy/ACL/lease/revocation matrices and registered protected reviews remain unaccepted. No new key/TCP diagnosis or production fallback is being pursued. The full goal is active.

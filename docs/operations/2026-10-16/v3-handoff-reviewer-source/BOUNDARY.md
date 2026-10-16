# Source-derived completion binding boundary — no SQL change authorized here

This is a concrete source blocker for completed v3 recovery and reviewer assignment/packet, not an assertion that historical v2 is broken. No PG/catalog was queried. All OIDs, installed function-body identity, ACL/default and native effects remain unobserved in this task. Exact file and dollar-body hashes/signatures/line ranges are in `dependency-lineage.json`.

## Existing composition and actual SQL path

| Caller/stage | Existing signature | Source behavior |
| --- | --- | --- |
| Initial/read author handoff | `read_research_author_handoff_context_v2(jsonb,uuid,text,text,uuid,text)` | source lock610091002 then global2409/6002; complete original request/row/hash/result/invocation/source seal/claim/reservation/deadline/completion checks |
| First completion | `commit_research_author_handoff_v2(jsonb,uuid,text,text,uuid,text)` | calls handoff context, only inserts original company_research completion; existing completion replay returns original receipt |
| Reviewer context | `read_research_reviewer_context_v2(jsonb,uuid,text,text,text,uuid,text)` | requires distinct principals; calls handoff context; requires author completion; checks existing counter_review reservation/work_key/order/deadlines |
| Reviewer assignment | `assign_research_reviewer_v2(jsonb,uuid,text,text,text,uuid,text)` | calls reviewer context, reserves original counter_review pool, stores immutable assignment; reads context again |
| Reviewer source packet | `read_research_reviewer_sources_v2(jsonb,uuid,text,text,text,uuid,text)` | reads reviewer context before/after, retained source row hash/rights/scope/content/clock/seal checks;307200 source/1048576 result caps |

Source files: `20261009_research_author_handoffs_v2.sql` and `20261009_research_reviewer_assignments_v2.sql`, unchanged tail inputs. The current c08 durable union replaces four author functions, not either handoff/reviewer function. The historical15d4 TS modules are references only, not imported/copied as current execution. Historical source closure77b1 and its compiled identity are not claimed.

## Actual gap and why no fallback is safe

In handoff context, after selecting `research_model_completions_v1`, `IF FOUND THEN` checks immutable completion but bypasses `read_research_author_result_v2`; only the ELSE arm invokes that active reader. The c08 active result/context arm reaches the candidate input reader and the candidate binding resolver. The completed arm does not.

`research_input_binding_candidate_v3(text,text,text,boolean)` in candidate36 rejects read tombstones even for retained bindings, checks exact registry core/registration/schema tuple, and is explicitly revoked from service_role. The old handoff and reviewer SQL files never call it. Adding a client call to this private resolver would require an unauthorized EXECUTE grant. Using current active input READ is also invalid after completion: candidate parent calls original assert-preparation, whose original live-parent check rejects an existing completion. No skipLive flag, synthetic RPC facade, stale cached context, configured byte equality, metadata schema relabel, or catch-and-fallback can replace these checks.

Counterexample from source, NOT a native execution: a genuine v3 author result completes; an append-only candidate read-revocation tombstone for its Hb is then present. Existing handoff completed arm can still return its stored context without reaching that tombstone check. Existing reviewer context/assignment/source calls inherit this absence. A server can rehash the stored bytes perfectly and still not learn the current tombstone state. No revoked-state acceptance test is claimed here.

The new first-handoff caller therefore supports only a context with completion null. It calls the unchanged live v3 validator/citation reader before commit; the existing SQL first-completion arm independently repeats the active result/source/role fences under its original locks. Post-commit context is checked for exact stored equality plus the returned completion receipt, without invoking an active reader after completion. This proves only the response of that operation in source contracts. A later completed READ, repeat handoff or reviewer operation is explicitly blocked with `research_v3_completed_binding_fence_unavailable`, before any reviewer assign/reserve/sources call. It never reports a reviewer packet or successful recovery.

## Minimal proposed next SQL revision — NOT implemented or approved

Prefer a single predecessor-guarded replacement of existing `read_research_author_handoff_context_v2`, preserving signature/OID/owner/security/search_path/ACL and all existing v2 body semantics. Do not add a public RPC, role, grant, registry, ledger or quota. Native catalog must establish the actual predecessor; source hashes alone are not installed pg_catalog proof.

For an explicit v3 request/payload arm, while holding the existing source→global locks, resolve `research_input_binding_candidate_v3(symbol,inventory,Hb,false)` using the existing owner. Enforce exact retained core/registration, original request Hb/inventory, stored protocol equality, sourceExecutionHash and existing finite material schema validation. This must execute for BOTH first completion and completed replay, and therefore for all reviewer context/assign/sources paths. Unknown tuple/version/profile and revoked/missing registration must reject, not fall back to v2. Existing v2 return remains four keys unchanged. A finite v3 return can add the actual resolved `binding` object; it must not use `approved:true` or a boolean fence indicator.

Next TS slice must consume that new closed v3 context shape and compare its real binding to the retained server tuple. Extract existing complete-response/cash/article pure revalidation as the smallest shared seam, maintaining active READ byte behavior. Completed recovery then uses that current handoff context and pure full arithmetic/receipt/observation verification only, never active input READ/FS/renew/recharge. Only after this fence exists can the reviewer caller perform existing assignment RPC, validate immutable result/author/reviewer relationship, read source packet, revalidate cash/scenario/article, serialize the bounded v3 packet and perform its final current-context comparison under the same original deadline.

The reviewer packet should retain the original article seven sections/full source text/tables/catalysts/counterevidence, original finite numeric citations and gaps, raw source-summary precision/rights/untrusted markers, separate reviewer writing window, exact article/result/request/Hb identities and all false capabilities. No result/editorial/publication union is implemented in this slice. The historical editorial validator is explicitly v2 and cannot be made v3 by changing a label.

Required next acceptance: real PG predecessor/ACL/body guards, first/replayed completion, READ binding revocation and non-resurrection, distinct reviewer assignment/counter_review budget/order, source withdrawal, actual response loss + explicit READ recovery for each mutation, no active-reader call after completion, full source/packet hashes/clocks/caps, and original v2/77 compatibility. Reviewer result/Q-R/reviewpack/atomic publication/whole S-C-B-Q-R-A and claim-by-claim semantics remain separate.

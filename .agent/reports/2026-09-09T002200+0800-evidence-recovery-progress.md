# Evidence recovery and retirement of global Shadow

Branch: `codex/evidence-research-no-global-shadow`
Verified base and current VPS release: `408c15c465715227690e1e429c8e9ab4b385f20b`
Status: implementation in progress; **not a completed rollout**.

## Implemented in this branch

- Removed global Shadow manifest/cutoff, observation/publication dependencies, public counters and experimental labels. Historical evidence remains; individual research, confidence, market, technical and adjacent-close gates remain unchanged.
- Acquires this run's live inputs before freezing its financial analysis cutoff. A same-day repair can be evaluated by a new run.
- Five-year price requests no longer stop at 240 bars. Authority reads page past 1,000 rows; complete coverage reads reject overflow and use stable ordering.
- Financial acquisition requirements now enumerate fields and quarters for general, cyclical and financial businesses. Each research result/detail records concrete missing fields and periods.
- Added an official-fact validator, immutable validation receipts and a guarded endpoint. Validation checks source identity, content provenance, units, periods, availability, duplicates and available accounting identities. No blanket validation update.
- Added validation availability timestamps to PIT readers; repeated identical validation does not move that timestamp.
- Prioritizes a supported forward earnings route over generic PB; missing financial-company inputs are no longer called a conclusively impossible valuation.
- Research detail binds its own fact revision rather than the latest unrelated 500 facts. Detail read errors no longer silently fall through to old decision content.
- Threads readiness separates credential, canary, schedule and historical/current ingestion states. Canary evidence is token-bound and bounded in age; disabled status no longer implies that no token exists.
- Standalone build output and a Linux-only artifact packager are available. No macOS native runtime artifact may be deployed to Linux.

## New root causes verified using real responses

1. The MOPS `t164sb01` request returns a Big5 preview/download form, not the iXBRL expected by the old parser. Its official `FileDownLoad` POST returns the actual UTF-8 inline XBRL. The new downloader follows that documented form contract and stores exact response hash/locator. TWSE and TPEx candidates can use it.
2. XBRL unit IDs are references, not fixed names. The parser now resolves declared TWD/share/per-share measures and rejects mismatched currency on balance facts too.
3. The real TSMC 2026 Q2 download yielded 31 relevant financial facts; all 31 passed the new **local** validator. This is not proof of a complete target-price model or production ingestion.
4. A read-only sample of 1,100 pending official observations for TSMC/Nanya had no matching provenance receipts in the new provenance plane. They cannot be made valid by merely changing a status. Reacquisition is required; the sample does not claim all 12,420 rows share the same problem.
5. VPS requests to the actual MOPS download still returned HTTP 307/security blocking. An explicit operator-side download can reach it; no platform protections were disabled.
6. The financial parser socket's parent directory was `root:root 0750`, preventing the web user from connecting. After correcting that directory group, the DynamicUser parser was also unable to read its script inside the private release directory. The branch now installs only the two credential-free parser scripts in a separate readable runtime directory; it does not grant the parser access to application secrets.

## Production actions actually performed

- Used the existing authenticated document API to upload two official TSMC files to private Supabase Storage. Receipt IDs:
  - Q2: `e91c25af-8f7d-47ca-8e4a-d511112c4af1`
  - Q1: `a41eb485-e6d3-47c2-81f5-c0fc6d0bdbb8`
- Both were accepted for storage, then rejected by the old worker because of `candidate_financial_local_parser_socket_unavailable`; **zero facts were added**. Their audit evidence remains. The branch corrects runtime failures to partial/error reporting rather than declaring documents invalid or returning a false-green worker result.
- Changed only `/run/stockinsider` group ownership to `stockinsider`, preserving mode 0750. The permanent socket/runtime deployment changes are not yet installed.
- The parser service/socket subsequently hit start-limit after the script-permission failure. The web service remains unchanged. Do not claim the parser is healthy until its isolated code path is installed and canaried.
- No secrets files edited. No migration applied. No release, image, volume, database or other site's files deleted. No new web version deployed.

## Verification so far

- Candidate/evidence/runtime/contract suite: 7 + 198 + 38 passed, zero skipped, after installing the pinned parser dependencies in an isolated local Python 3.12 virtualenv. The Arelle subprocess fixture passed; this is not evidence of production parser health.
- New migration applied twice to an ephemeral local PostgreSQL cluster: permissions, exact provenance, idempotency and availability timestamp tests passed.
- Existing migration contract suite: 78 passed.
- TypeScript and production build passed after the latest runtime changes. Lint exited zero with 34 warnings (not a warning-free result).
- Product correctness: 150/150 passed, zero skipped. Root `pg` dependencies were installed; the remaining two E2E failures were fixed by preventing isolated UI fixtures from querying the production candidate plane. Production candidate read failures remain fail-closed.
- Financial coverage rejects YTD EPS/share contexts as substitutes for discrete quarters. Validation receipt privileges explicitly revoke inherited service-role UPDATE/DELETE/TRUNCATE; the local PostgreSQL test exercises permissive default privileges too.
- No exact final-commit review or protected CI evidence has been generated. These local tests are not authorization to apply a production migration or deploy.

## Remaining acceptance work

- Complete source/final-commit review, protected CI and reviewed migration attestation before production activation. The new migration expects the already-installed financial-acquisition/evidence planes.
- Install isolated parser code and unit, recover its socket, retry documents through an audited retry path, and verify actual financial writes. Existing rejected receipt identity must not be silently overwritten.
- Reacquire/validate all required issuer fields and quarters. Per-company weighted share denominators, financial BVPS, debt/cash-flow inputs and forward assumptions are not magically present after parser fixes.
- Durable historical backfill progress, IPO/suspension-aware missingness and complete 60-month coverage still require acceptance. A 1,320-bar request alone is not proof that history is complete.
- Finish company-specific operating drivers and independently sourced research narratives, not only generic financial summaries.
- Threads non-self public-search canary and actual mention ingestion remain unverified; connector stays disabled.
- Reviewed Linux standalone deployment, current/previous-safe release cleanup, final research/publication and external VPS canary remain pending. Global Shadow is retired in code, not yet on the live site.

## Sources used for implementation checks

- XBRL unit reference and monetary/per-share definitions: https://specifications.xbrl.org/work-product-index-group-base-spec-base-spec.html
- Official MOPS financial preview/download form: https://mopsov.twse.com.tw/server-java/t164sb01
- Socket directory ownership versus socket ownership: https://github.com/systemd/systemd/blob/main/man/systemd.socket.xml

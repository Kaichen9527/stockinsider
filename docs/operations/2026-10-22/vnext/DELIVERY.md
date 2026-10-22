> Historical milestone only. For current implementation, exact runtime source and remaining VM work see [STATUS.md](STATUS.md) and [CURRENT-DELIVERY.md](CURRENT-DELIVERY.md). Original results below retain their source scopes.

# vNext VM delivery — partial acceptance, disabled by default

Product source: `cee65ca8dd8b3ec12bc53b434d17b5913d15592f`; frozen source/test head: `6410c9a`, independent branch `codex/stockinsider-vnext-oct22`, remote main/base `93e44475cbb0c27beb26e4dcb68e382096a4e212` (rechecked during delivery). All work ran on the existing Linux Codex VM. GPT-6.1 Sol authored the product implementation through the selected implementation executor; the coordinating executor handled integration, environment, evidence and review. This is not an attestation that the coordinator itself changed model.

**Not full acceptance or deployment approval.** No merge, production migration/deploy/writer/data operation, old schedule resumption, consumed-run retry, immutable-ref change or historical cleanup occurred. The new application flag defaults off and the new DB mode defaults off. Installing source on a branch does not enable either mode.

## Implemented slice

- Versioned deterministic screening/deep factors, retained null weights, bounded rights-aware cache, independent-root accounting, substantive input hashing, freshness/holiday/continuity rules, conservative shared market read model and two-block UI.
- Explicit admission before financial coverage/download/parser/quote work; every listed legacy HTTP trigger intercepts enabled mode. Missing stock scope rejects; explicit `[]` returns zero work. Discovery requires explicit operator `action: "screen"`, not an implicit missing-scope request. No scheduler was enabled; planned 08:15/18:30 execution remains isolated-rollout work.
- Additive private RLS ledger for <=20 cross-day active members, <=4 reserved/started attempts per official session, exact idempotency, failure/retry accounting, immutable research revisions and author/reviewer execution separation.
- Actual server-derived current observations and rotation orchestration; waiting incumbents with complete comparison evidence remain candidates for replacement, while missing-data incumbents and unfinished jobs cannot be evicted by a manufactured low score. Original 18:30 real-clock gate remains.
- Finite exact-profile legacy RPC wrappers prevent a second research authority when vNext is active. Admin-only activation checks idle execution and full saved routine metadata. Activation is not exposed to HTTP/service_role. New commands take the shared mode lock before reading mode state.
- Typed per-claim evidence/hash/unit/period and arithmetic checks, reviewer original-evidence reads, immutable receipt replay and publish-time membership/input/qualification checks. These enforce a protocol; they do not prove prose semantics or that a real model ran.
- Read-only published homepage/detail/history with no legacy/shadow/draft filling, truthful waiting/gaps, preserved prior revisions and late-publication rejection after exit.

The finite legacy installer intentionally grants the new owner SELECT on four existing execution tables and adds four SELECT RLS policies for idle checks. Old routine ACL/OID/owner/signatures remain pinned; this is not a claim that every table ACL in the namespace is unchanged. Normal security review is still required.

## Actual VM verification

Exact commands, source hashes, times, resource samples and individual counts are in `evidence/commands.json`, `evidence/summary.json` and the finite TAP files. No counts are added to historical suites or to earlier failing runs.

| Verification | Actual result / scope |
|---|---|
| Pure policy/contract | 19 cases; deterministic fixtures, not native/source acquisition |
| Actual discovery source + explicit cache adapter | 1 case; real functions, synthetic cached rows, no default DB client |
| Financial expensive-call boundary | 1 case; actual functions reject before instrumented DB/network calls |
| Existing affected regressions | Lease routes 9; candidate core 31; parser 4; official financials 20; Taiwan market 26; source policy 11; financial documents 3, each separate run |
| Genuine captured schema + financial/publication prefix + legacy fence | 5 tests including parent; real PG17.11, exact catalog/body inverse parity, ACL drift refusal, real `pg_locks` contention and post-lock mode recheck; 14 direct routines fenced, one trigger-only routine is independently non-callable as a function |
| Admission | 5 tests including parent; real service_role SQL, eight parallel requests, duplicate claims, four starts, sixteen synthetic prior-day incumbents + four new =20; permanent failure still charged |
| HTTP to PostgreSQL | 3 tests including parent; actual built Next -> controlled finite REST facade -> real service_role SQL; eight aliases,16 enqueue deliveries,8 claim deliveries,4 jobs/starts and20 active. Not real PostgREST/HBA/Contabo |
| Author/review/publication | 6 tests including parent; two synthetic issuers, original evidence/arithmetic checks, rejected review/charged retry/two failures/exit/late publish rejection. Not formal author/reviewer execution |
| Source-content/revision | 4 tests including parent; real DB content dedup, fetch-clock-only no new job, changed source bytes -> second immutable revision, first retained |
| Waiting rotation | 1 real-PG case; exact selector chooses fully comparable waiting member; actual orchestration -> real RPC returns premarket deferral with unchanged tables. Two actual postclose sessions/positive swap NOT_RUN |
| Browser | 10 desktop/mobile UI cases plus2 separate revision-page cases; real installed Chromium151, isolated Next, read-only synthetic transport of persisted DB snapshots. Not live news or Contabo |
| Types/lint | Typecheck passed; lint passed with33 inherited warnings and no new error |
| Full build | `cd web && npm run build -- --webpack` passed compile/types/static pages/traces. VM default `npm run build` Turbopack failed on platform CSS-worker bind EPERM; RED retained. Hosted ordinary CI independently ran the default command successfully on6410c9a; that does not relabel the VM failure |

Playwright's pinned Chromium145 download returned403 and was not bypassed/retried unchanged. Browser acceptance used `/usr/bin/chromium`151.0.7922.173; exact launcher/binary hashes are recorded. Screenshots are synthetic fixture displays, visibly unqualified; no two formal articles were published.

The parser regression uses a task-owned pinned Python3.12/Arelle2.44.7 venv and a test-only writable XDG config adapter. Original readonly-home failures are retained. No production parser runtime/service/socket was touched.

## Important remaining acceptance

See VN01–VN20 in `evidence/summary.json`. In particular:

- True two-session postclose replacement and full multi-challenger atomic scenarios remain unverified. Real time was premarket; no DB/system clock or guard was changed. Waiting selection + premarket refusal are narrower evidence.
- Verified catalyst cancellation/target-hit/contradiction authorities, source-comparable voice baselines, weekly semantic thesis review, true model execution/semantic per-claim independent review, complete real-data scoring/market event analysis and formal publication remain incomplete or unavailable. A valid structured envelope is not semantic research approval.
- Full production-equivalent ACL/HBA/peer/writer-lease and original legal legacy lifecycle coexistence are not established by disposable fixtures. New mode deliberately refuses legacy claims; default-off predecessor body bytes/identities are retained, but original default-off workflow performance is not fully reaccepted.
- The final TWSE public index canary returned200/stat OK with a20261021 payload; PTT remained403. The index sample was not ingested as qualified facts or a research result. Actual Contabo staging services/database/schema/queue/storage were not provisioned or tested. No production host connection was attempted. The SSH container proof is only OpenSSH9.2 login/forced-command isolation, not Contabo application acceptance.
- New PR-only quality workflow uses pinned actions and real PG tests. The fresh ordinary `vnext-quality` job passed on source/test head6410c9a, including default `npm run build` on ubuntu-24.04 and real isolated PG. Protected requirements/architecture/exact-review/root failed; downstream product/model code gates were skipped. Exact failing review assertion is NOT_OBSERVED because the job-log redirect was blocked; annotations only report exit1. Independent registered subject-bound review remains required. No overall protected PASS, PR approval, merge or deploy is claimed.

## Remaining VM implementation (not credential-only blockers)

The first reviewable slice intentionally remains partial. These code items have not been implemented and must continue separately from the external network work:

- `store.ts::executeResearch` currently stops after financial preparation. No automatic author/reviewer provider worker, once-only provider invocation journal or uncertain-response recovery is implemented. Submission endpoints validate externally submitted artifacts; they do not prove a model invocation.
- `market-producer.ts::cachedMarketSnapshot` reports AI unavailable. A downgrade-only overlay helper is not a persisted AI event interpretation worker.
- `cacheContent` accepts already-extracted, rights-bounded structured clues. There is no permitted-original-content acquisition/extraction worker; 200/50 limits and hash dedup currently apply to stored claims.
- Weekly all-active cache checks are not a weekly substantive thesis/valuation/contradiction review. Deep-score functions are present, but their substantive evidence-checklist inputs are not populated automatically.
- Trusted calendar provisioning, foreign price/calendar completion, supplemental FX/margin/operations producers and comparable source-volume baselines remain unfinished. No synthetic price/time generator supplies formal data.

These are explicit code gaps, not covered by the native or UI passes below and not waived by a successful build. The PR must remain draft/partial.

## External actions, concentrated

1. **GitHub PR is now created:** normal `gh pr create --draft` actually succeeded at2026-10-22T00:38:53.797313Z: [PR384](https://github.com/Kaichen9527/stockinsider/pull/384), attached to this task. Earlier REST/GraphQL403 evidence is retained. The cause of this observed access change is not established; HTTP draft publication, general network readiness and TCP22 are not inferred. No new token/manual PR creation is needed. Public-source domain access is reported separately by canary outcomes; only if still blocked does the owner need the supported environment Edit/Save/Publish action. Existing task adoption is not assumed.
2. **Only when resuming Contabo staging:** platform administrator/support must grant exactly `5.104.83.211/32 TCP22` if the platform supports it, then trusted host-key verification and a new explicitly approved time-limited staging identity are needed. No verified TCP UI field/tool exists here. An HTTP-domain publish/network secret does not grant SSH. The old memory-only key expired at08:08:18 Taipei; it was not renewed. **Do not run the old expired Console APPLY block.** The known locator `5.104.83.211 / vmi3152467` is production, not proof that staging exists. Bootstrap currently creates only a new restricted preflight identity/namespace, not app/DB isolation or deployment authority.
3. **Real research acceptance:** supply available, permitted source/runtime identities through managed injection only; retain gaps where no licensed source exists. Separate author/reviewer execution and original-evidence semantic review must actually run in isolation before formal publication. No new paid subscription is assumed.

No Mac access, generic root/docker account, all-network rule, custom tunnel/VPN, unsafe host-key acceptance or production credential reuse is a fallback.

## Evidence custody

Recorded logs, REDs, schema/catalog rows, synthetic payloads, browser traces, WIP and fixture DBs stay in the task-owned VM/private containers. One initial aggregate SSH diagnostic file was overwritten during the earlier probe sequence; individual errors/scripts/logs remain. The final inventory is not a claim that every earlier aggregate version survived. Git contains only an explicit public-safe subset, hashes and screenshots. Private inventory proves recorded names/lengths/hashes, not that another reviewer obtained the contents. All original checkout/history/raw/cache remains; retained DB/image usage is included in live filesystem admission. Lab containers are stopped and retained at handoff; no Docker removal/prune occurs. Resource peaks are sampled, not instantaneous.

This delivery remains a partial, default-off candidate for normal review. Release Gate stays pending.

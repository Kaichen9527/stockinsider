# Bounded ranking / public integration — 2026-11-07 second batch

## Source and authority

Protection branch codex/stockinsider-v2-cloud-nov07 continues08cd468/source4a941ac and original PR384; source integration7ae6117, historical-cycle replay correction3e742e6, fixed runtime source9aacbcd06d508d213d6661ef058ba5e3868cbcc2. Browser harness-only correctione6f5683 has the identical git web tree; exact build and harness commits are recorded separately. All commands run on this same selected VM. No main recreation/force push/new PR, no hosted/native rerun or deployment.

## Implemented product source

- New additive ranking snapshot SQL: single transaction under original source/global locks; server-derived active<=20, exact-pinned existing review/provider/rights/qualification/current-price/deep-score authority; immutable append, CAS predecessor, original-request idempotency, singleton-successor chain and transactional existing audit event. Private FK pins preserve every catalog publication, including outside Top10. Existing writer fence, owner/RLS/direct privilege revocation and mutation/truncate rejection retained. No existing body/pin/role/review ref changed.
- Fixed read RPC returns immutable snapshot and separate current observations. Default-off internal POST uses exact internal bearer through requireInternalAuth, configured operator and original writer lease. Original cycle epilogue has deterministic per-session run identity; a historical rerun retrieves the original predecessor even if a successor is now latest. No schedule/timer is enabled.
- Opt-in Home renders frozen market + Top0–10, links exact run/research revision. Detail refuses wrong/empty run or revision, never replaces selected history with latest, and separately downgrades currently invalid/incomplete deep100 status. Missing RPC/snapshot fails closed.
- /candidates reads only frozen active-pool catalog, stable version/catalog/filter-bound keyset, explicit public allowlist, no worker/GET writes. Source/industry filters return no invented matches and show gaps. Full unadmitted/exited/history catalog remains unfinished. Candidate history links do not falsely claim Top10 membership.
- StockChart fallback uses Taiwan calendar weeks/months and optional null-preserving volume; current periods provisional, conflicting/future bars rejected. Supplied empty weekly/monthly series stay empty. Existing price/source/corporate-action data and240/1320/520 gates unchanged. Main supplied timeframe pipeline and full3-calendar-year+warmup remain unfinished.

## Qualified independent engineering review

Different author agents and root integration were read by integration_review. Repaired findings: explicit empty run accidentally selected latest; detail current-validity parity/deep100; nonranked candidate links; supplied empty-period daily masquerade; FK retention for all catalog publications; historical cycle rerun after newer successor. Source review ends with zero unresolved blocker/high/P2 in this bounded scope. Not A1/protected approval; native HOLD remains.

SQL migration SHA256ed1fdb3c6ff1a0323fc8b9386b0afb27cb08804092ea3715696b4264c02507fb; ranking-command7370a9a2df1dceb43b48e5f4999f6511aba39ca49c68c848281fc2d44be46340. Formal independent exact ref remains missing. No self-signed review/ref or old pinned authority was changed.

## Preserved failed observations

- First full typecheck FAIL: wrong-policy test fixture inferred a literal policy type. Fixed its declared test type, retaining the same rejection assertion.
- Initial lint FAIL: JSX constructed in try/catch. Runtime corrected to capture data/error and render outside catch, with no disabled rule.
- First browser FAIL: global main>section count4 versus2; assertion now scopes the visible actual vNext home, as the existing browser suite does.
- Second browser FAIL: generic false==true after desktop Top0/1/10, bound-invalid detail and wrong-revision checks passed; candidate stage lacked a named assertion. Exact cause was not fully localized. Harness now waits for the actual next-page1001 content and names cursor/privacy/overflow assertions; no oracle was relaxed. Independent reviewer approved one bounded harness retry only, not native. Original failure files/hashes retained.

## Material operating limitation / still blocked

The immutable publication qualification proof retains its original120second TTL and cannot be refreshed on a published job. Most earlier-in-day research therefore causes20:30 ranking to retain its prior snapshot. Genuine current financial/price requalification and fully supported deep100 producers remain unimplemented; no changed flag or fake authority supplies a daily positive. SQL native grammar/catalog/RLS/writer/CAS/concurrent replay/rollback are NOT_RUN under native HOLD; source checks and synthetic browser transport cannot pass them.

Actual legal-source→data→distinctauthor/reviewer→website, real adjacent completed TW sessions, protected review, Contabo access/isolation/backup restore/rollback and iCloud independent canary/quota/key/clean-VM restore remain separate gates. No archive/deletion/reclaimed capacity or deployed version is claimed. Owner-reported old VM originals are preserved separately; no old lab rerun. Fullgoal ACTIVE/INCOMPLETE.

## Final measured outcome

Fixed runtime9aacbcd:59 focused tests PASS (Top10pure12, target reader11, ranking/cycle5, candidate10, calendar7, actual Detail SSR3, SQL source construction11), types PASS, lint0errors/34existingwarnings, full ordinary build PASS. Test/harness103c650 has identical web treed330f5b5b6cfab70acd923aa34e6fb2dfda7026f; no rebuild claim is transferred to changed runtime.

Browser attempt3 failed on unscoped global main strictness and was retained. Attempts1/3 reached same browser failure class limit2 → HOLD; the scoped/visible/render-settled repair received independent engineering review before one final attempt4. Actual final Next HTTP/SSR + installed Chromium151 desktop/mobile:12checks PASS,17readRPC,0writeRPC,0provider calls. Top0/1/10, frozen revision not latest substitution, current invalidity, wrong revision, stable second page/private allowlist/viewport checks passed. Final contexts/browser/app/bridge were closed.

Earlier screenshot counts were not visual PASS: root inspected one and found the loading skeleton. Final screenshots wait for a visible Top10; root visually inspected final desktop/mobile Top10 and mobile candidates. Selected synthetic screenshots are saved under second-batch-images. They prove this synthetic UI scope, not researched stock quality or real sessions. See [exact outcomes/resources/failure hashes](second-batch-checks.json). No native HOLD, A1 or production gate was released.

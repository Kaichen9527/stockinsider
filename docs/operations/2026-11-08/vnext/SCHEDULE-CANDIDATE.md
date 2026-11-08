# Taipei schedule/admission — SOURCE CANDIDATE / INCOMPLETE

Tested source **2f1050a6ba5deafe8ae55c2d778766f140f062e7**, tree **3a580414ea082a7ccb97862f9379e1fa8207c07f**, runtime web tree **d4d9bdb7fbe65c934a20390eaa056c0d86c40332**, continues protection checkpoint272f1ee975218c21ba358e9d4d50dc1e7b5ec86b on the same development VM. Explicit GPT-6.1 Sol High authors and separate readonly engineering reviewer. Original PR384 subject remains cbb581662e72942610ff85b0bf5e7e47ddddfa46; no formal A1/approval/ref issued.

**No schedule was installed or activated.** Production facade stays Disabled; fixture outputs always deny execution/charging authority. Four new staging unit candidates are inert, and all production units/installers/routes/SQL remain unchanged. This batch implements bounded schedule logic/source configuration; it does not establish actual20:30/08:15 operation or whole-cycle idempotency.

## Existing control chain and material gaps

| Existing source | Observed behavior / remaining gap |
|---|---|
| `deployment/vps/systemd/stockinsider-research-cycle.timer/.service` | Daily21:00 Asia/Taipei, Persistenttrue; root/prodenv and waiting production flock; drains final data then calls pipeline-run. Installer enables this and other production timers. Repository source is not live host inventory. |
| Final freeze/reconcile units |20:15 freeze can run3900s;20:40 reconcile obtains institutional/margin data after the requested20:30 slot. Do not presume data is complete at20:30 or stamp a retained snapshot with a new date. |
| `research-cycle.ts` | Calendar sync/screen-context, source extraction, market interpretation, audit/screen, dispatch, audit then ranking. Core postclose guard is18:30; ranking separately requires20:30. Ranking replay occurs after earlier work, so it cannot prove whole-cycle no-extra-IO replay. |
| `ranking-command.ts` / ranking SQL | Stable session run/predecessor replay and original writer/atomic authority are retained. Current request accepts run/predecessor only, not a scheduler-supplied fixed cutoff; SQL derives its own database clock via clock_timestamp(). This candidate cannot claim fixed-cutoff runtime publication. |
| `market-ai-worker.ts` / existing market ledger | Builds current cached baseline and may publish/model through original authority. Frozen-baseline replay is not a whole schedule-entry receipt; repeated baseline/cycle stages do not acquire a new scheduler authority here. |
| `calendar-sync.ts` / cached admission SQL | SQL-selected paired official rows, original source clocks/rights/session rules. Upstream scheduled rows and complete advance-day/predecessor coverage are not supplied to this new planner by an authenticated adapter.08:15 cannot invent a completed current session or infer holidays from absent rows. |
| Vercel cron/source files | Empty declarations are retained; they do not prove no hosted/manual/user/other-host scheduler is active. A current complete trusted production inventory/cutover is still required. |

[Detailed source/control inventory and author verification](SCHEDULE-SOURCE-MAP.md) retains the original code locations and limits. No old guard/pin/profile was changed. The only existing application-source change is the unused, still-disabled `STAGING_SCHEDULE.postClose` planned constant from18:30 to20:30, matching V2; original SQL18:30 guard remains unchanged.

## Deterministic fixture logic

`schedule-admission.ts` models two purposes only:20:30 publication of an already qualified active-pool ranking, and08:15 update of one shared market snapshot. It does not run deep research, routine morning rotation, an all-source scan or a model. Fixed Asia/Taipei slots yield UTC12:30/00:15 cutoffs independent of invocation time. Source-candidate planning windows are half-open20:30–20:35 and08:15–08:20; missed windows skip without catchup. A later invocation cannot use later-acquired source/calendar evidence.

The bounded explicit fixture contract validates exact clocks and latest-as-of paired TWSE/TPEx calendar heads, same-clock conflicts/corrections, deterministic equivalent-head selection and official cancellation. Unknown/missing/disagreeing heads refuse. A known newer partial prior close cannot silently fall back to an older complete pair. Missing unrepresented dates still have no completeness proof and remain an explicit gap; a valid fixture intent is not an authenticated official-calendar admission. Official weekend rows are accepted only as fixture evidence, never inferred by weekday arithmetic.

Incomplete/late source versions or bindings preserve the supplied previous immutable snapshot's original session/cutoff/source date unchanged, or null if no prior exists. Intent identity stays deterministic for action/session/fixed cutoff/policy. Exact frozen request/receipt comparison models completed replay, pending/uncertain hold and conflicting payload reuse. Duplicate active entries for either job and legacy/Vercel conflicts refuse; fixture inventory is never a trusted live single-owner attestation.

For a new ranking intent, qualification observation age uses a120second half-open bound at invocation time. A matching completed fixture receipt may retain its original result without granting a new action; pending/uncertain cannot invite retry. This age guard does not infer an actual proof expiresAt, renew TTL or replace current rights/financial/price/source/review checks. Morning has no new financial120second requirement. Real proof expiry/rights and original writer/ledger/source bindings remain unverified in every fixture output.

Runtime `scheduleAdmissionBoundary` rejects all caller adapters/options and stays Disabled. Source/state/receipt/inventory metadata and deterministic IDs cannot create a durable admission, a writer lease or a billable-attempt authority. No worker/store/route/queue or ledger has been connected, replaced or queried by this module.

## Inert staging configuration

[Candidate guide and four unit files](../../../../deployment/staging/vnext/SCHEDULE-CANDIDATE.md) are separate from the production installer's unit directory. Both timer and service use `ConditionPathExists=!/` (Linux root exists, so false); services only execute `/usr/bin/false` as a second barrier. They have no Install section, production env/path/lock, credential, HTTP/worker loader or provisioning command. The nonroot username is unprovisioned intent, not an established identity. PrivateNetwork and filesystem protections are specified, not observed runtime isolation.

Timers express daily wall-clock wake intent with Persistentfalse, no randomized delay and1second accuracy. Official-day admission belongs to the separately gated logic; a daily calendar expression is not permission to work on holidays. Both jobs declare shared nonblocking staging serialization as an unimplemented requirement. No actual lock is acquired, and a local flock could not replace the original DB lease or prove global scheduler ownership.

`schedule-candidate.mjs` deeply freezes the catalog and accepts no caller readiness/configuration/approval adapter. Inspection remains Disabled with all requirements NOT_OBSERVED; execution always rejects. Restricted readonly `vnext-preflight-v1` still grants no worker/timer/writer capability. Neither the config nor planner can activate the other.

## Actual VM verification

[Exact source/commands/log hashes/resources](schedule-checks.json): **319 focused tests PASS /0fail /0skip**, types PASS, lint PASS (0errors/34existingwarnings), full ordinary `npm --prefix web run build` PASS. Actual local HTTP/SSR/Chromium151 desktop/mobile: **14 existing regressions PASS**, synthetic RPC23reads/0writes/0provider. They are not scheduled-worker or real-source/time acceptance. Authors'14pure and9staging cases overlap319; earlier9staging PASS preceded the ranking-purpose correction and is preserved separately.

Offline `systemd-analyze verify --man=no` on the exact four candidates passed with no warnings/output. Offline calendar parsing with explicit base-time2026-11-08T00:00:00Z confirmed two daily occurrences at12:30UTC/20:30Taipei and00:15UTC/08:15Taipei. No system clock was changed; no manager, timer/service install/reload/start/enable occurred. These parser results do not replace two actual adjacent trading sessions.

Independent source/doc reviewer reported0openblocker/high in this disabled scope and did not independently execute the final tests/systemd commands. Review repaired newer-partial-close fallback, duplicate other-job schedules, equivalent-head nondeterminism, latest-only conflict handling and new-intent freshness versus completed replay semantics. No approved oracle, original writer or qualification gate was weakened.

Heavy checks ran serially with Node22.14/frozen locks and the original8GiB workspace/tmp floor plus512MiB admission reference and8GiB sampled descendant RSS guard; no violation or deletion. Samples are not instantaneous/cgroup maxima. Browser cleanup reports app exited/fixture bridge closed. Previous296/14 and failures remain bound to their old source subjects.

## Remaining gates / external state

Actual official advance-day/full prior-session source connection, real fixed-cutoff propagation, whole-entry durable replay/uncertain recovery, current source/rights/qualification proof, all-writer serialization, trusted single production scheduling inventory, isolated worker integration and cutover are NOT_CONNECTED/NOT_OBSERVED. No actual charge/no-extra-IO or deployed schedule acceptance is inferred from fixtures. Formal A1/protected exact review, native HOLD, real-source/model/distinct-review publication, adjacent real sessions, CI, staging/restore/rollback and release gates remain incomplete.

Coordinator reports Cloud VPN Configured/Draft saved/Not published and Contabo device interactive authorization pending. This is not current development-executor VPN/SSH/identity readiness. Current VM metadata remains running/current revision1 with no secret bindings or outbound identity aliases observed. No key/agent/env file, VPN/config, Contabo/SSH, new task/executor/rebuild, SQL/PG/native retry, writer/schedule, old VM/iCloud, merge or deployment action.0bytes reclaimed; verified archive location none.

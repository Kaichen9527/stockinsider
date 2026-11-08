# Schedule source/control inventory — source only

# Bounded schedule/admission source candidate

Base inspected: `272f1ee975218c21ba358e9d4d50dc1e7b5ec86b` in `/workspace/stockinsider`.
Author scope: new `web/src/lib/vnext/schedule-admission.ts` and focused sibling test;
no existing cycle, writer, route, authority, policy pin, SQL, timer, installer or
environment changes. The production facade is unconditionally Disabled and
rejects every argument. There is no runtime adapter or import of a worker/store.
One explicit V2 correction changes the unused, disabled planned
`STAGING_SCHEDULE.postClose` constant from18:30 to20:30. Its timezone/premarket/
disabled state remain unchanged; the original core18:30 SQL guard is untouched.

## Candidate semantics

`vnext-schedule-admission-fixture-v1` is a closed bounded fixture DTO, bound to
the existing policy version and the new source-candidate schedule policy
`taipei-fixed-cutoff-five-minute-v1`. This is an explicit new candidate policy,
not proof of actual scheduler behavior; the original core18:30 guard is untouched.

- `rank_publish_2030`: immutable ranking publication intent from the already
  qualified active pool, at exactly 20:30 Asia/Taipei. It never admits stocks,
  starts deep research or invokes the whole postclose cycle.
- `shared_market_0815`: shared market update intent at exactly 08:15 Asia/Taipei.
  It never rotates, admits, dispatches or publishes rankings. Its evidence session
  is the latest completed official close, normally the previous trading date;
  it is not relabeled as the current scheduled date.
- Candidate windows are half-open `[20:30,20:35)` and `[08:15,08:20)` with no
  persistent catchup. Invocation time never replaces the intended original
  cutoff. Exact microsecond comparisons reuse `evidenceInstant`.
- Calendar rows use the existing eleven-column official source shape. Source,
  collection and recording clocks must all be at or before the fixed cutoff to
  participate. Latest per-day/per-market recorded heads are selected; tied
  semantic conflicts reject, equivalent ties have a deterministic authority-ID
  winner. Both TWSE and TPEX are required for the current official day. Explicit
  cancelled pairs are holidays; missing/conflicting/unknown coverage defers.
  There is no weekday inference. A more recent known partial/disagreeing close
  cannot silently fall back to an older complete pair. Fully cancelled official
  prior dates may be skipped. Completely unrepresented dates remain a stated
  coverage gap; this bounded planner cannot prove their absence.
- Source revision availability, its rights-qualification observation and its
  generic source-qualification observation must be known by the fixed cutoff.
  In this fixture contract these qualification observations follow availability.
  This is not a new legal rule that grants rights and is not the actual financial
  qualification proof. Caller-supplied fixture observations prove no authority.
- A NEW ranking fixture intent requires invocation now to be strictly earlier
  than the generic qualification observation plus120s. Exact+119.999999s passes;
  exact+120s defers. A matching completed fixture receipt can redisplay its
  original immutable result after that age check would block a new intent; all
  original cutoff calendar/source and inventory checks still run first. Pending/
  uncertain receipts never grant another attempt. Morning has no financial120s
  check. This check never creates an expiresAt or renews the actual financial/
  price/right proof; original actual expiry and rights binding remain explicit
  unmodeled gaps and mandatory existing SQL responsibilities.
- Incomplete/missing/late source and every deferral preserve the prior snapshot
  ID, original session, original cutoff and source timestamp exactly. No new
  snapshot, renewed source date or publication is manufactured.
- The bounded inventory rejects active legacy/Vercel cycle overlap, duplicate
  authorities for either known job, missing current authority, and a stale or
  future inventory observation. This models a single-scheduler invariant; it is
  not a live host inventory or proof other timers are disabled.
- Deterministic intent IDs cover schema, policy, job and fixed cutoff. The fixture
  receipt request hash also binds the selected calendar heads, source revision,
  prior metadata and inventory. Reordered rows/entries are deterministic. A
  completed receipt represents fixture replay only; pending/uncertain receipts
  never authorize another attempt. Replay revalidates current fixture calendar,
  inventory and source instead of treating the receipt as an enable token.

Every result includes `executionAllowed:false`, `chargeAuthorized:false`,
`sourceCauseVerified:false`, `activation:'disabled_not_connected'`, and explicit
gaps. There is no live complete/replay/no-charge claim, no durable ledger and no
caller actor/approval/metadata activation. Prior data is a strict small metadata
allowlist; no raw rights, text, secret or request payload is projected.

## Existing source inventory and integration gaps

1. `research-cycle.ts:4-15` calls calendar sync and `screen-context`, then sources,
   market interpretation, weekly audit, dispatch, another audit and finally
   `publishCycleRanking`. Its context gate uses the existing postclose condition
   (18:30). Calendar sync can already write before that gate. The final ranking
   replay does not fence earlier expensive stages. This entire cycle must not be
   launched merely to perform the 20:30 ranking publication slot.
2. `ranking-command.ts` already has deterministic session ranking IDs, prior
   snapshot lookup and existing writer/lease integration. The ranking SQL
   `20261107_vnext_ranking_snapshot_v1.sql:75-105` accepts only rankingRunId and
   expectedPreviousRankingRunId, checks exact replay before current-head CAS,
   then uses the actual database clock and official completed same-day session
   after 20:30. It retains the old snapshot for missing/incomplete current market
   authority. The candidate fixed scheduling cutoff is not an accepted existing
   RPC field; no caller override was added. Existing publish-time financial,
   price, deep/reviewer/rights and expiry checks remain mandatory.
3. `market-ai-worker.ts:8-14` reads the cached baseline, selects the original
   server provider binding and enters the existing writer. Even its missing-
   binding branch writes a baseline with an explicit gap. It cannot be called
   by this zero-I/O planner. `market-interpretation.ts` provides frozen baseline
   invocation reserve/recovery/settle idempotency; this is model-call ledger
   scope, not full scheduled-cycle idempotency or global no-charge proof.
4. `market-producer.ts:10,35-53,80` defaults to invocation now, chooses the latest
   completed official session and carries its original sourceAt. The next-08:15
   expiry is an expiry rule, not a newly acquired source timestamp. A morning
   schedule cannot renew stale history or erase missing foreign/core inputs.
5. `20261022_vnext_cached_admission_v2.sql:36-68` reads actual official rows under
   original operator/mode/source lock, requires provider/clock/civil-date and
   dual-market agreement, and distinguishes a known official date from completed
   close. However `20260811_actionability_recovery_v3_14.sql:102-107` and its
   transaction-time successor accept incoming `scheduled` rows then skip them.
   Thus an actual advance premarket current-day official pair producer has not
   been observed. Positive fixtures with a known future close are explicitly
   synthetic contract input; they do not establish such a real producer.
6. `policy.ts:74` unused `STAGING_SCHEDULE` is corrected to20:30/08:15 while
   remaining enabled:false. It is not connected to this namespace or an actual
   timer. `web/vercel.json` has no crons.
   `deployment/vps/systemd/stockinsider-research-cycle.timer:5-6` contains21:00
   Asia/Taipei/Persistent=true and its service invokes legacy pipeline work.
   The separate final-freeze/reconcile timers source20:15/20:40; the long freeze
   window can overlap20:30. None of these source files proves an installed host
   state or source completeness at20:30. No timers/installers were changed/run.
7. Existing authenticated internal endpoints and analysis writer lease remain
   the only actual control chain. Trusted schedule identity, trusted calendar
   source connection, source revision/rights bindings, queue/cycle replay and
   single active scheduling authority are NOT_CONNECTED/NOT_OBSERVED here.

The execution boundary author's staging config is a separate source candidate;
neither candidate activates the other. A future integration must recheck the
original writer, rights, freshness, mode, session, replay and source gates at
actual publication. It may not accept fixture `state`, receipts, flags or IDs as
authority and may not claim a full cycle is idempotent from ranking/model replay.

## Verification scope

Focused pure tests: Node22.14 `--experimental-strip-types --test
web/src/lib/vnext/schedule-admission.test.ts` on this source:14PASS/0fail.
This covers both fixed slots/window boundaries, disabled planned schedule
alignment, exact120s new ranking intent expiry versus retained completed replay,
morning prior-date preservation, holiday/unknown/missing/cross-market heads,
official weekend rows without weekday inference, newer partial-close rejection,
microsecond as-of/latest tie/reorder semantics, late rights/source/qualification,
inventory conflicts for either job, uncertain/pending receipt hold, payload replay
conflict, strict private/authority/clock/bounds rejection and zero adapter calls.
No native/SQL grammar, CAS,
ACL, provider, network, actual timer, host conflict or real source acquisition
was executed. Existing native HOLD, original PR head and release gates preserved.


---

# Staging schedule source candidate — 2026-11-08

Base source: `272f1ee975218c21ba358e9d4d50dc1e7b5ec86b`.
This is a new staging design and offline contract slice. No timer, service,
account, database, identity, lock, runtime configuration or worker is provisioned.
Native HOLD, protected review, release gates, production units/installers,
restricted SSH forced command and existing pins are unchanged.

## Concrete candidate

`deployment/staging/vnext/schedule-candidate.mjs` declares exactly two source
intents: immutable ranking publication from the qualified active pool at 20:30
and one frozen shared market at 08:15, both
Asia/Taipei. Four adjacent `stockinsider-vnext-oct22-staging-*.service/.timer`
files are inert review artifacts. Every timer AND service has
`ConditionPathExists=!/`: Linux root exists, so the condition is false. Both
services also have only `ExecStart=/usr/bin/false`. Removing a condition still
does not create a worker. They contain no `[Install]`, production paths,
environment files, HTTP commands, credential loader, dependency on the current
production worker or executable application payload. `sivnext-schedule` is an
unprovisioned nonroot account intent; no account creation is requested.
The existing production installer's source glob remains in `deployment/vps/systemd`,
which does not include these staging candidates. Do not install these files.

Timer syntax describes a daily wake intent, not permission to work on weekdays,
holidays or unknown sessions. Persistent catchup, random delay, automatic retry
and a lock-wait queue are forbidden. The companion pure admission candidate uses
half-open five-minute windows `[20:30,20:35)` and `[08:15,08:20)` and retains the
original slot cutoff, never a delayed start time. These windows are a source
candidate, not acceptance of the existing runtime guard or permission to widen
it. All actual execution facades stay disabled. No existing 18:30 runtime
postclose constant is modified.

The single staging lock identity is declarative and unimplemented. Both jobs
and every isolated writer must participate, acquire nonblocking and recheck
the original slot deadline after acquisition. Contention skips without work or
charge. This process lock cannot replace the existing durable writer lease,
cross-process ledger, original admission/day-attempt authority or uncertain
response recovery. A rank replay at the cycle's end cannot prove that preceding
source/model/research work was not repeated. An isolated binding must reuse the
reviewed authority semantics without reusing production credentials or lock
paths. No lock is acquired here.

The 20:30 candidate references `ranking-command.ts#publishCycleRanking`, not
`runPostcloseResearchCycle`: it does not authorize starting a deep-research
cycle at that clock. The older full research cycle's preceding source/model/
dispatch steps and missing whole-entry idempotency remain context gaps, not
work wired into these inert ranking artifacts.

## Current repository observations, not current host observations

At the source above, existing production research timer is DAILY 21:00
Asia/Taipei, `Persistent=true`, with an `[Install]` section. Its root service
uses the production current release and environment path and waits up to 1800
seconds for `stockinsider-production-write.lock`, then runs final queue drain
and `pipeline-run`. `deployment/vps/install-systemd-schedules.sh` enables the
research/source/data timers and worker. None of these files is changed or run.
The 20:15 final-freeze and 20:40 final-reconcile timers also use persistent
delivery. The latter refreshes institutional flow and margin data after the new
20:30 intended ranking slot: neither wall clock nor an earlier freeze proves
all required facts are complete at 20:30. Missing, late or unqualified inputs
retain the prior immutable snapshot, its original date and truthful gaps.

The repository currently declares `web/vercel.json` crons empty. That is a source
observation only. A complete CURRENT trusted pinned-host inventory of deployed
release, active/enabled timers/services, other users' units, root/user cron and
hosted schedulers has not been obtained. The configuration reports
`single_production_timer_inventory=NOT_OBSERVED`; no caller plan boolean can
change it. A staging namespace or local flock does not establish a single live
production owner. Existing 21:00 legacy work and all other write paths must be
reconciled under a separately reviewed cutover before any formal schedule.

## Disabled runtime requirements

Official TWSE/TPEX calendar authority, the current/previous-session pair for
08:15, completed/postclose authority for 20:30, whole-entry durable ledger and
idempotency, current source/publication bindings, independent runtime isolation,
all-writer serialization, current scheduler inventory and authenticated worker
integration all remain `NOT_OBSERVED`. Cached completed-only calendar ingestion
is not proof of the advance session pair needed at 08:15. No weekday inference,
synthetic clock or fixture can satisfy these authorities.

The catalog is deeply frozen. Inspection accepts no caller options and always
returns `Disabled`; `executeScheduledCandidate(jobId)` rejects with
`STAGING_SCHEDULE_DISABLED` / exit-code intent 78. There is no adapter registration
or worker import. The existing `vnext-preflight-v1` forced command remains only a
read-only capacity observation and grants no timer, worker or writer access.
No key, environment file, agent/socket, SSH, VPN, Contabo, network, SQL, native,
system-manager operation, account creation or deployment occurs in this slice.

## Verification

After root's explicit serial coordination, the pinned Node22 command
`--test scripts/vnext-staging-schedule-candidate.test.mjs` passed 9/9 with exit0,
no warnings/skips/cancellations, duration54.03304ms. Log:
`work/staging-schedule-node.log`, SHA256
`f627015ec674c28e1a0367e908d7b5affb0350fdc65289dfd4e050f869240155`.
This first result preceded root's semantic precision correction of the ranking
purpose/reference from the full research cycle to ranking publication only.
The related source assertion was added; updated focused verification is pending
serial coordination. No unit, execution boundary or authority changed.

Root then authorized exactly one updated focused run after this correction:
9/9 PASS, exit0, no warnings/skips/cancellations, duration52.021837ms. Both logs
are retained. Updated log: `work/staging-schedule-node-updated.log`, SHA256
`ed695a0b287966f48820451cba516aebde396b6fa9bb6e535bfe8ddd6ad04085`.
The new stable source guide is
`deployment/staging/vnext/SCHEDULE-CANDIDATE.md`, linking all four inert units.

`/usr/bin/systemd-analyze verify --man=no` on all four exact new unit files
returned exit0 and no output/warnings. Log:
`work/staging-schedule-systemd-verify.log`, empty-file SHA256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
This was offline source verification, without a manager reload or any start or
enable operation. These checks establish source shape/syntax only, never live
admission, current host inventory or staging acceptance.

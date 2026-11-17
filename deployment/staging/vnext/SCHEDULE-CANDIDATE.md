# Inert staging schedule candidates

These are source artifacts for review, not installed or executable schedules.
The [frozen catalog](schedule-candidate.mjs) declares immutable ranking
publication from the qualified active pool at 20:30 and one frozen shared
market snapshot at 08:15, Asia/Taipei. It does not start a research cycle.

| Intent | Timer source | Service source |
| --- | --- | --- |
| 20:30 ranking publication | [ranking timer](stockinsider-vnext-oct22-staging-rank-publish.timer) | [ranking service](stockinsider-vnext-oct22-staging-rank-publish.service) |
| 08:15 shared market | [market timer](stockinsider-vnext-oct22-staging-shared-market.timer) | [market service](stockinsider-vnext-oct22-staging-shared-market.service) |

Every unit has `ConditionPathExists=!/`, which is false on Linux. Both services
also have only `ExecStart=/usr/bin/false`, use an unprovisioned nonroot account
intent and have no application payload, environment/credential loader or
production paths. There is no `[Install]` section or installer. No unit should
be installed from this candidate. The existing production installer is unchanged
and reads its separate production directory.

Daily timer syntax only describes a wake intent. Official TWSE/TPEX calendar
authority determines admission; weekdays do not. The source candidate uses
five-minute half-open start windows with the original scheduled cutoff, no
persistent catchup, random delay, automatic retry or lock-wait queue. Both jobs
and every isolated writer must share nonblocking serialization while retaining
the original durable writer lease/ledger; that binding is unimplemented here.

The runtime facade always returns `Disabled` or rejects with disabled exit-code
intent 78. Caller metadata cannot enable it. Official calendar/session pairs,
durable authority/idempotency, current source/publication bindings, independent
runtime isolation and reviewed authenticated worker execution remain
`NOT_OBSERVED`. The read-only `vnext-preflight-v1` forced command grants no worker
or schedule execution.

Single production scheduling ownership also remains `NOT_OBSERVED`: the
repository retains a daily 21:00 legacy timer with persistent catchup and an
installer enable path, plus source/data timers. Source definitions cannot prove
which remote timers, services, user/root cron or hosted schedulers are active.
A current trusted pinned-host inventory and reviewed reconciliation are required
before any cutover. The source's 20:40 final-reconcile work also means a 20:30
clock cannot prove complete ranking inputs; missing/late inputs retain the prior
immutable snapshot, its original date and gaps.

Offline source-contract tests and `systemd-analyze verify` check syntax and
declared boundaries only. They establish no live calendar admission, scheduler
inventory, staging acceptance or release authority.

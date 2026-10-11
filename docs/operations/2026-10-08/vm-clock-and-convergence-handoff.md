# VM clock and convergence checkpoint

Observed three-P2 repair is frozen separately at `43d19d6e3daf609a904335eb7c8d963bdd45fa7f`, 30/30 actual native TAP, types/lint/build pass; maker receipt and red history retained. Exact independent repair review remains pending.

New isolated development branch normally merges approved latest paper `d868d53e56a3084face40a24eadc1d5964cfe122` and Cloud private reader `8560e5e96d50e2b1f8df540bf4cbd9da86c4f02f`. Actual 25/25 focused tests zero skips, typecheck, lint (33 existing warnings), and normal web build pass. This branch still descends from reviewed-with-findings observed486 until its separate repair is independently accepted; it is not a release or production approval. Receipt: `.agent/reports/2026-10-08T16-38-paper-cloud-reader-convergence-vm.json`.

## Actual clock diagnosis

On VM PostgreSQL17.11, library package0.9.10-2.1 (library byte hash45c4822a…; differs from CI binary), no-preload/+0/-3600 all three original SQL forms return SQLSTATE57014 in107–112ms. With +3600 all three exceed the external2-second deadline. Each timed-out query is cancelled and each owned disposable cluster is stopped. No SQL canary or production policy was changed.

The small C SIGALRM/epoll probe measures fake-minus-direct-syscall time: +3600 shows3600 before/after epoll, but0 inside the signal handler; -3600 similarly shows-3600 outside,0 inside. This supports the reported thread-local wait/signal clock inconsistency for this exact library. It does not establish all PG16 behavior, repair CI, or approve a library rebuild/workaround. No-preload/+0 handler deltas are0 as expected. PG16 was not present in the known installed tool profile and was not downloaded. Full credential-free receipt: `.agent/reports/2026-10-08T16-34-pg-faketime-signal-diagnostic.json`; original probe sources/executable and owned PG logs remain private under `/workspace/clock-signal-diagnostic-oct08`.

Next queue is approved insiderc96 fresh-profile PG/Linuxjournal; full guarded Next/PostgREST maximum transport is a separate worker-owned acceptance pending exact handoff. Native0825 and first-publication64f7 remain outstanding. No automatic roles, protected attestation, formal publication, or five-day operation completion is claimed. VPS capacity did not block VM work.

## Insider c96 actual native checkpoint

Exact c96f291 remains unchanged in a fresh detached worktree. Actual PG17.11:16TAP,7pass/9fail/0skip. First positive admission fails missing FROM-clause entry for table admit_insider_snapshot_v1 at the token-resolution UPDATE; later tests consequently lack the snapshot. Linux FD journal1/1pass0skip uses injected local response, not guarded HTTP. Red receipt: .agent/reports/2026-10-08T16-39-insider-c96-vm-red.json. Dedicated worker owns fixes and full transport/capacity acceptance; no activation or complete candidate coverage claimed.

## Native0825 actual portable checkpoint

Exact0825 remains inactive and unchanged. Actual parser50+lifecycle31+original five suites62 =143/143pass0skip. Original model-runner file actually executes23TAP,19pass/4fail0skip; the requested name pattern did not exclude host probes, so no filtered-suite success is claimed. Fail12 is current-node host preflight; fail16 doctor child status1 lacks detailed captured checks; fail18 fails auth transport creation with routing blocked; fail19 worker exits routing/host blocked without successful model result. No pin/permission/signing/activation change. Receipt .agent/reports/2026-10-08T16-44-native0825-vm.json preserves exact source hashes and command/log hashes. Native web tree equals1d92; no new native build is claimed. These are maker portable results, not a protected live oracle, Mac acceptance or original CI root-cause fix.

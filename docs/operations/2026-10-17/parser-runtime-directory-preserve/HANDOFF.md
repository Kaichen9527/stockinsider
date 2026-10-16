# Parser runtime directory preservation — source candidate only

Exact base: `93e44475cbb0c27beb26e4dcb68e382096a4e212`, verified against remote main before work. The only product change is line37 of `deployment/vps/systemd/stockinsider-web-standalone.service`:

```diff
 RuntimeDirectory=stockinsider
 RuntimeDirectoryMode=0750
+RuntimeDirectoryPreserve=yes
```

Old unit:1312 bytes, SHA256 `fa55cd9efbe061e500b405fb5bfc9ea0a89e0d1ad1a915e2b135d25a0d3380cb`.
New unit:1341 bytes, SHA256 `7a948b2732c02595fe5100bb10206e99c58401c4f8921a7230fa66da373397a5`.
Deleting the single added line reconstructs the entire original bytes exactly. No other unit/parser/app/SQL/role/ACL/authority/pin/limit/workflow/operator source changed. In particular, the old fa55 canonical-profile expectation and consumed deployment helpers remain unchanged; this candidate is not approved for those procedures.

## Purpose and evidence boundary

Root reported at2026-10-17 01:05:09+08:00 (2026-10-16 17:05:09Z): deployed currentDD; parser socket/service active with listener inode8262, but the exact pathname `/run/stockinsider/candidate-financial-parser.sock` absent in both host and current web worker root. The web unit and independent parser listener share `/run/stockinsider`; original RuntimeDirectoryPreserve defaults to no. The actor/time/full cause of unlink remains unknown. These are Root-supplied observations, not new Cloud/VPS probes by this task.

Root's design basis is the [systemd v255 primary documentation](https://raw.githubusercontent.com/systemd/systemd/v255/man/systemd.exec.xml): default no removes the runtime directory on service stop; restart preserves it for restart operations; yes also preserves explicit stop, while reboot still clears runtime storage. The guarded activation uses separate stop/start, so the finite candidate selects yes. No HTTP documentation fetch was performed in this task. **This change does not recreate the currently missing socket or establish full causal repair.**

## Checks actually performed

- Remote exact-base identity; original unit hash; one insertion/zero deletions; exact reverse byte parity and expected insertion position.
- Exact-base parser socket/service/socket-server pins match Root's supplied c01a4972…,41bbd5a9…,b88897da… identities. These are Git-byte checks, not installed-state verification.
- Fresh `/workspace` and `/tmp` free-space checks retain the original8GiB floor. A separate minimal sparse checkout and its own Git common live on `/tmp`; Git writes are not zero. Original research checkout and334 inherited research sources were not edited or merged.
- Local `systemd-analyze --version` reports257.13. PID1 is `tail`, and the production WorkingDirectory/server/verifier script tree is absent. Offline `systemd-analyze verify` is **NOT_RUN** under these missing prerequisites; paths/dependencies were not stubbed or normalized. No fake one-line acceptance test was added.

No systemd lifecycle, socket connection, PG, Node/app/build/npm, SSH/VPS/HTTP, CI/PR/deployment or retry was executed. No cleanup, cache removal, permission change, process stop or budget reduction occurred. Hash/source checks are not native acceptance or maker independent approval.

## Required subsequent acceptance — NOT_RUN

1. Isolated Linux systemd reproduction: default-stop RED; candidate explicit stop+start, manual restart and automatic restart preserve the independent listener pathname and connectivity. Verify modes/owners/source identity and reboot cleanup boundary. Local257 availability does not establish v255 lifecycle acceptance.
2. Root independent exact review, normal repository/protected checks and any required separately reviewed canonical-profile compatibility before formal operations. This task opens no PR and bypasses no gate.
3. Separately bounded, reviewed quiescent restoration using original parser units for the existing missing pathname, followed by original guarded retry→worker→fact/terminal verification with prior partial receipt preserved. No quiescence/restart/capacity approval is inferred from a PID snapshot.

Root's prior preliminary memory2,532,749,312 <2,684,354,560 remains a HOLD observation, not fresh full admission. The single original upload202 for國巨 receipt `c5b6ccf0-25d5-4fa3-b257-4f0b194c0090` /SHA8900870e… is not repeated. Reported parser partial/socket_unavailable/facts0 and workerHTTP0 remain unchanged. Last Root DB observation at2026-10-17 00:10:27.793504+08:00 was writerDD/lease0; this task does not refresh it.

All historical RED/WIP, old six partials/five queued jobs and research pending work remain. DD one-shot and terminal PR370..382 are untouched. Full three-stage goal, two formal articles, source Top20, technical observation/strategy/formal schedule/whole closure/fixed peer remain pending. Source delivery stops for Root review; no follow-on runtime or CI action is authorized here.

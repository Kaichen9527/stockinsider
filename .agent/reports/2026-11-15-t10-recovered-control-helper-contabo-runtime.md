# T10 — Recovered close-control helper on Contabo

Contabo staging diagnostics used the exact three restored files from `78f80388343e3b20463bd58c84c3b500e0f6c7fd`. The Linux Python 3.12.3 runner was non-root and had a private network namespace. All 11 existing tests passed in 0.658 seconds, including the real child timeout/reap, strict receipt projection and preservation of the original collector result. The helper SHA-256 and caller's embedded pin matched.

A separate transient probe ran the helper's real `runtime_budget()` as a systemd `DynamicUser`, with a 90-second runtime/start timeout, 128 MiB memory and 12 tasks. Parent and child both returned `None` at line 192 because `systemctl show` exited 1 and returned zero fields. The result repeated with `PrivateNetwork=yes` and with `PrivateNetwork=no` plus IP denial.

To isolate the variable, three fresh services queried their own unit and the existing staging observer unit. Both dynamic-user runs had a visible bus socket and a working NSS account lookup. Both returned `Failed to get properties: Transport endpoint is not connected` for the default and explicit local bus. The static unprivileged account succeeded under the same hardening and IP denial. This identifies the failing dynamic-user read path on this host. It leaves the underlying D-Bus policy or daemon cause open.

The recovered helper requires the manager read during the in-window budget check. The observed failure would cause it to skip supplemental requests while retaining the original five-source result. Keep the unit, kernel and cutoff checks in the follow-up fix. It needs a verifiable local manager-to-service handoff that preserves the existing dynamic identity and security limits, followed by an end-to-end staging rerun.

The evidence covers offline tests and live systemd admission probes. The two date-specific collection runs are scheduled for November 16 and 17 at 21:26–21:28 Asia/Taipei. The recovered helper was not installed, and the already scheduled observer/supplement units and production services were left untouched. All diagnostic units became inactive. No HTTP or production database calls were made.

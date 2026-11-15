# T10 — Contabo close-control systemd credential probe

The exact recovered observer previously failed its in-service `systemctl show` admission check under `DynamicUser`. The system bus is running and the static non-root control reads the same properties. The D-Bus unit had no retained entries for the preceding 30 minutes, so the reason for the dynamic-user transport failure remains open.

Tested an alternative handoff using the installed systemd 255 `SetCredential` in four one-off, network-isolated Contabo staging services. The manager delivered a read-only unit-bound profile to the exact service directory. Both the dynamic parent and the child with a minimal environment could read it, validate the service and current cgroup, check memory and tasks, and derive a bounded deadline from the process start. The root supervisor separately verified the live manager properties while each probe was active.

| Probe | Parent | Child |
| --- | --- | --- |
| Matching profile and live cgroup | Verified, 88.894 s remaining | Verified, 88.598 s remaining |
| Profile specified 128 MiB, live cgroup set to 96 MiB | Rejected at live cgroup check | Rejected at live cgroup check |
| Profile named a different unit | Rejected at unit check | Rejected at unit check |
| Profile missing | Rejected | Rejected |

The profile is illustrative manager-issued configuration, with no cryptographic signature. In the next implementation, use a reviewed unit and manager-side verification for the 90-second and kill-mode settings; the credential bytes alone cannot prove those settings are loaded. The probe uses the real clock and checks kernel state. Actual in-window capture, HTTP, receipt writing and systemd integration of the recovered Python helper remain pending.

The probe code, four normalized receipts and temporary-unit end state are retained. All probes became inactive. No active collector, timer, service identity or production resource changed.

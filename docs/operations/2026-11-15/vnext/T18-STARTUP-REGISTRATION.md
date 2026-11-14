# Sequential registration of the fixed staging DB unit

The coordinator verified exact 7811aaa on Contabo against the real September19
backup: exit0 DB_VERIFIED_FIXED_T18_EXERCISED, 644.826 seconds, PostgREST16.3 and
both pinned Next16.3.4 packages on the SAME clone, A→B→A plus fault/automatic A
rollback. Original daily content09/12 and publication09/19 stayed stale_readonly;
home/static200 are liveness only, eight write/RPC negatives rejected, original
formal signatures and cleanup unchanged. The exact public receipt from commit
3e49dfd23aba8c74d4cd36b74f9946992495dc6e is retained unchanged alongside this note.
This does not prove stock detail, new radar, full business semantics or deployment.

Keep the first no-key failure too: 16.231 seconds, inspect_nonsecret_host_observations,
APP NO_VALID_REFUSAL_RECORD, DB journal start but no APP/REST creation, no backup
key, unchanged production and successful cleanup. Later canonical admission
passed in20.229 seconds and the zero-key invalid test rejected before DB restore.
The original failure is intermittent; its exact host cause remains unconfirmed.

The source launched separate systemd-run processes with successive Popen calls.
That does not guarantee DB's StartTransientUnit registration reaches PID1 before
APP's Requires/After reference. A missing transient dependency can prevent APP
exec and hence prevent its LoadCredential connection. This is a source-level
race candidate, not a retroactive diagnosis of the first run.

The host now waits up to5 seconds AFTER launching DB and BEFORE launching APP.
It queries ONLY stockinsider-t18-db.service for LoadState, ActiveState and MainPID,
with each query bounded by1 second/the remaining deadline. It continues only
when loaded, active, positive PID and the systemd-run wrapper is still alive.
Wrapper exit, masked/error settings or deadline raise fixed refusal labels.
This is scheduling, never a readiness receipt or restore authority. Existing
actual three UID/cgroup/namespace/capability checks still run before backup-key
stdin, and all original lock, FD3–9, GCM, SQL, proxy, resource and cleanup gates
remain unchanged. No optional path denial or LoadCredential property is changed.

Cloud tests exercise scheduling states and refusals only. Actual root transient
registration on the new source remains an onsite check; no root/systemd/Contabo
operation was run in Cloud. HOLD and the two-table HTTP evidence stay distinct.

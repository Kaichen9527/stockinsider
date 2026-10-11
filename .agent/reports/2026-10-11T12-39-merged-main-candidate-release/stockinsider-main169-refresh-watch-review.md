# Unsigned scoped refresh watcher review

Subject: /tmp/stockinsider-main169-refresh-watch-oct11.py, SHA256 2c34e946594385a1b914569ad3d28f2d98f1d2269ab8c64d7ea79012552bb953.

Verdict: REQUEST_CHANGES for one P2.

P2 — lines19–21,35: the90-minute monotonic limit is checked only at iteration entry. A query started just before deadline still receives15seconds, then unconditional30seconds sleep follows. Independent execution of the exact source with controlled mocks starts the last iteration at5399seconds, advances15seconds for the query and30seconds for sleep, and exits at5444seconds. Clamp subprocess timeout and sleep to remaining time and recheck after query/before persisting a success result; deadline must retain the last observed result and exit2, not manufacture terminal success.

Other reviewed boundaries are sound in scope: same host-heavy then production-write nonblocking lock order; fixed socket/port/database/user with env-i and no-password; SQL BEGIN READ ONLY, local10second statement timeout and ROLLBACK; exact pipeline/research UUIDs with their join. There are no pipeline invocations, database mutations, source rewrites, timer changes or strategy modifications. Probe failures only reattempt the read; subprocess stderr/exception text are not emitted, only error type. Raw researchStatus, terminalReason and coverage are preserved; terminal means observed pipeline state, not a completeness/publication attestation. No claim is made that partial research is a verified publication.

Operator prerequisite: the script does not create /run/stockinsider-main169-refresh-watch-oct11. The launcher must establish an owned private real directory before start, or the script must safely create/validate it. Otherwise both first write and exception-handler write fail and locks are released. Existing directory/watcher lifecycle was not independently inspected. The deadline exit also releases locks while backend status may remain running; its explicit observation_deadline must remain visible and must not be interpreted as permission to restart work. Existing database lease protection remains separate.

Tests: Python source compiled and executed only with mocked time, subprocess, pathlib and os/flock. No real lock, subprocess, database, VPS connection or production operation was performed. Original probe is preserved separately. This is not protected approval or publication evidence.

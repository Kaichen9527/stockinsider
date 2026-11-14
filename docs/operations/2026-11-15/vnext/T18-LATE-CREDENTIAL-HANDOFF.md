# T18 fixed post-restore staging credential handoff

This source changes only the independently reviewed staging runner. HOLD, disabled
generic/live facade, original backup authentication, host lock, private PG17,
original grants, two-table GET scope, exact Next bytes and production denials stay.
No Cloud root/systemd/native admission or Contabo execution is claimed.

## Preserved observations and diagnosis limit

The real7811aaa old-pair exercise remains valid as recorded in
`contabo-t18-authenticated-old-next-pair-rollback.json` (evidence3e49dfd).
The exactf9fbcfd real run failed at612.455 seconds before any detail observation;
its exact public receipt is preserved in
`t18-candidate-detail-contabo-readpoint-rejection.json` (evidence67db109e).
Its outer fixed_runner_outcome_unexpected does not establish a failed DB restore.

The coordinator reproduced599/600 seconds accepted,601/612 rejected for the
original900-second token with300 seconds required remaining. The generic scoped
engine handler lost StageCredentialRejected. The duration and low broker peaks
match that cause closely, but no original iat/precise entry-point was recorded:
this remains a reproduced candidate cause, not a retrospective confirmed diagnosis.

## Executable lifecycle

1. Root prepares the original isolated workspace, original six capabilities and
   three fixed units. APP receives only the public admission placeholder in ALL
   modes. Original pre-key UID/group/namespace/cookie/cgroup/asset guards remain.
2. FD9 initially holds an exact public103-byte root-owned sealed marker. A dup of
   the original verified root-to-DB seqpacket channel survives exec as FD10. The
   controller removes inheritance before ANY PG child; backup FD3–8 are unchanged.
3. Full GCM/TOC/restore/migration/fence/owner/RLS/CHECK/FK/lineage validation runs.
   A genuine radar/schema GAP returns without requesting signed staging material.
   Successful reader observation, fingerprint/dates, fixed RLS/role installation
   and owned socket activation all precede the fixed late request.
4. DB shuts down the placeholder APP and sends exactly one J packet over FD10.
   No callback, path, caller assertion or receipt enters this protocol. Root
   rechecks the already-bound DB process/cgroup/caps and host reserves. This
   request can mint a reader credential only; it cannot authorize restore.
5. Root requires natural APP exit0, stopped/empty cgroup, transient unit collection
   and absent systemd credential. It removes only the verified root-owned child
   socket. It REUSES the parent directory inode because DB has a RO bind on it.
6. Root mints the FIRST signed JWT/HMAC now, starts the same fixed APP unit with
   the same LoadCredential socket contract, reseals the new control socket and
   observes three real unit identities and their private namespace. No release
   asset bytes or production units change. Root supplies one sealed FD9 via T.
7. DB checks root/seals/readonly material, replaces FD9 and closes FD10, then
   independently reconnects/HELLO-verifies fresh APP (peer UID/GID/caps/groups,
   real kernel cookie, control RO mount) and cgroup budget. APP independently
   verifies immutable assets/native credential ACL/mount and exact token match.
   Only then do unchanged CONFIGURE, GET-only proxy, eight negative write/RPC
   checks, genuine A/B/A/fault rollback and final token check run.
8. Original owned PG and host cleanup remain mandatory; FD6 lock closes last.
   Interrupted/failed replacement is rejection and host cleanup, never fallback
   to a pathname credential, older APP/token or weaker grant/profile.

Lifetime stays900 seconds, minimum remaining stays300;599/600 pass and601 fails
for a preexisting token. The final HTTP acceptance still requires unexpired.
Root has a single75-second late-operation deadline (per-command timeout is clipped
to remaining time); DB send/receive shares a single90-second deadline. Existing
1200/1250-second controller/host ceilings and memory/disk floors remain unchanged.
If restore consumes the overall budget, it still refuses; this change adds no time.

## Bounded diagnostics

The runner exports only fixed phase/errorClass, after owned-clone cleanup is
observed complete. Allowed phases separate radar readpoint, fingerprint/dates,
reader-role install, owned socket activation, initial APP shutdown, stage handoff,
stage credential lifetime, fresh APP binding, port preconditions, REST/APP
CONFIGURE, fixed HTTP exercise, final token check, broker cleanup, final snapshot
check and candidate-detail query. Classes are stage_lifetime/material/handoff,
timeout, os_error, parse_error, rejected or unexpected. No exception messages,
SQL, rows, stack, token/claims, key, runtime path or broker stderr are interpolated.
The earliest scoped refusal survives a later broker shutdown failure. Host unit
cleanup has its own final evidence and is not inferred from clone cleanup.

## Cloud versus onsite evidence

Cloud tests use actual nonroot PostgreSQL17.11, private Unix sockets and synthetic
custom archives, plus actual Linux seals/SCM_RIGHTS/FD mapping and real HS256
signatures. Only wallclock is advanced for612 seconds; no actual ten-minute sleep
or production-size backup is claimed. Injected private consumer failures test
error routing, never public OS admission. Actual nonroot root-channel/bootstrap
refusals remain tested. Native systemd LoadCredential/collection/new peer/cgroup
joining must be tested onsite on this exact new source. Existing pinned Next/
PostgREST byte hashes, ACL/RO denials and original bootstrap migration pins apply.

Stage the exact delta manifest, then admission, invalid control, and only after
those pass a real replay using the coordinator's unchanged host lock and stdin
key custody. No Cloud remote login, backup/key transfer or new permission is
needed. The failedf9fbcfd subject must not be replayed as a fix. Genuine detail
HTTP, original RPC and new radar release acceptance remain NOT_RUN; missing
snapshot data must remain a GAP.

# Fixed onsite T18 orchestration — native credentials, admission first

Use only the reviewed staging source and the two original pinned release COPIES.
No production release, database path, credential, service or timer is modified.
The original T17 host lock remains held through cleanup and formal signature
comparison. HOLD, formal A1/CI and the disabled generic facade remain unchanged.
This source is not a full release acceptance or production deployment approval.

## Exact source and onsite roots

The native credential baseline7811aaa used46 verified blobs and is now backed by
an actual same-clone old-pair rollback receipt (3e49dfd23aba8c74d4cd36b74f9946992495dc6e).
The separate startup registration subjectcc0 retains46; its no-key admission was
reported successful in16.118 seconds. See T18-STARTUP-REGISTRATION.md for the
preserved initial intermittent failure and the bounded scheduling fix.

The current candidate-detail preflight starts from exactcc0: apply the two
replacements and one added module in
[t18-candidate-detail-stage-manifest.json](t18-candidate-detail-stage-manifest.json),
for47 required blobs. All other baseline sources, four historical migrations and
original asset pins remain. The root launcher stays exactly the cc0 hash.
The old native-credential stage manifest/receipt describe their original subject;
use the current preflight receipt and T18-CANDIDATE-DETAIL-PREFLIGHT.md for scope.
This adds no detail HTTP/RPC/grants. Three example units remain documentation;
the launcher never installs or reads them. No build artifacts from Cloud are needed.

| Input | Host path | Unit binding |
| --- | --- | --- |
| Public reviewed source | /run/stockinsider-t18-host-source | RO /readonly/t18-source |
| Existing verified asset COPIES | /var/tmp/stockinsider-t18-fa1d6c-assets | RO /run/t18-assets |
| Original private manifest | /run/stockinsider-t17-5b65286/source/database-manifest.json | FD5 only |
| Original exclusive lock | /run/stockinsider-t17-5b65286/restore-host.lock | SAME open description, FD6 |

Stage and verify exact Git blobs as root before invocation. Public code must be
root-owned, non-writable by other users and readable by the three staging users;
no env files, private manifest, backup or key belongs in this source root.
The manifest stays root 0400 in its original private location. No production
release path is bound, copied or chmodded. Original asset bytes, modes and pins
remain unchanged. No build artifacts from Cloud are needed.

Only these NEW fixed unit names are used: stockinsider-t18-db.service,
stockinsider-t18-app.service and stockinsider-t18-rest.service. The host source
rejects existing units, mutable staging paths or a pre-existing native APP
credential. It must run in PID1's host mount namespace, not a caller-private one.
Locked no-login si-t18-db/app/rest accounts and their reserved groups persist
between runs. Aliases, unexpected memberships and active account processes reject.

## Native systemd credentials: why the path alone was insufficient

The coordinator's exact af9f0008 no-key run stopped at APP credential_tmpfs after
5.359 seconds, with no backup key, unchanged formal signatures and complete
staging cleanup. Actual systemd255 controls then established these differences:

- A host-mounted scratch child under /run/credentials is hidden by systemd's
  covering readonly tmpfs; even an explicit child RO bind was absent/EACCES.
- An ordinary private /run child works as a 1 MiB RW tmpfs, but BOTH fixed Next
  source commits require a normalized /run/credentials/ credential prefix.
- Official LoadCredential from a root-only UNIX stream socket works: the loader
  peer is root, reads bytes plus EOF, and installs a native credential without a
  host plaintext file or payload output.
- The native path is /run/credentials/<full-unit>.service. Its single private
  tmpfs is exactly 1 MiB and ST_RDONLY; flags include ro,nosuid,nodev,noexec.
  Directory/file are root:root 0550/0440 with a named APP read ACL. APP can read
  but not write; distinct DB and REST controls got EACCES.

These are coordinator-reported kernel observations, not admission for this new
source. The launcher uses official LoadCredential, not the failed ordinary-path
alias, a symlink bypass, a projection mode or modified release bytes.

APP receives the fixed property:

```
LoadCredential=postgrest-service-role.jwt:/run/stockinsider-t18/credential-loader/credential.sock
```

The host creates that loader parent root 0700 and socket root 0600. After preparing
storage/cipher inputs, it starts DB then APP and serves one bounded payload to
the actual root loader peer BEFORE waiting for APP MainPID/control socket.
The listener accepts within 15 seconds and transfer is bounded by 5 seconds;
APP startup has a 20-second limit. There is no credential-file source, caller
path, callback, URL or secret in argv/environment/unit properties.

Admission serves only PUBLIC_T18_ADMISSION_ONLY_NO_AUTHORITY. It creates no JWT
HMAC, opens no backup/manifest, reads no backup key, starts no PG or app server,
and still performs the actual source/assets/UID/group/namespace/cgroup checks.
The placeholder cannot pass CONFIGURE authentication.

Invalid/real modes instead create one fresh reader JWT plus a 32-byte staging-only
HMAC. ONLY the JWT goes to systemd's memory-backed native credential. APP's fixed
path is /run/credentials/stockinsider-t18-app.service; it checks the actual root
ownership, 0550/0440 modes, named APP POSIX ACL, private 1 MiB readonly tmpfs and
read-only flags. Unknown ACL grants/mounts reject. DB and REST retain explicit
native-path denials. The token filename remains the one compiled into both Next
packages; despite its historical service-role filename, this is only the fresh
t18_reader staging token, never a production/service-role credential.

APP no longer writes or unlinks the credential. CONFIGURE must carry a valid
reader JWT/HMAC and the token must match the actual systemd file byte-for-byte
with constant-time comparison. systemd owns credential cleanup on unit stop.

## Original backup handoff plus separately scoped FD9

Both data modes retain the original 8 GiB preallocated one-use AES-XTS dm-crypt
workspace, retained root 0400 verity image, exact ciphertext size/SHA, fixed private
PG17 Unix socket, GCM authentication and every existing DB restore/reader gate.
The six backup-capability packet and its sender/receiver functions are unchanged:

1. FD3: exactly 32+EOF backup key pipe (32 zero-valued bytes in invalid mode).
2. FD4: held readonly immutable ciphertext inode.
3. FD5: original root-only manifest pinned by the expected digest.
4. FD6: SAME exclusive host-lock open description.
5. FD7: host backing directory for reserve/device checks.
6. FD8: readonly preallocated workspace image for loop/dm identity checks.

AF_UNIX SOCK_SEQPACKET, root peer authentication, one V record and exactly six
SCM_RIGHTS capabilities remain. AFTER that packet, a distinct T record carries
ONE readonly root-owned anonymous sealed memfd for FD9. It holds only the staging
HMAC/JWT, at most 4135 bytes; no backup key or data is included. The receiver
protects FD9 above29 before mapping the original 3..8 slots, then maps9. Any
malformed/truncated rights or exec failure closes all owned 3..9 descriptors.

The fixed DB entry observes actual FD9 root ownership, nlink 0, mode 0400, readonly
access and all kernel seals before proceeding, and removes inheritance. The
controller reads its bounded bytes only in the already-validated clone path.
FD9 cannot grant restore authority: UID/namespace/cgroup/lock, original FD3–8,
manifest, held verity ciphertext, two-phase GCM, PG/SQL/RLS/lineage gates remain.
There is no additional caller FD selector or readiness flag. Existing CONFIGURE
operations and their exact fields are unchanged.

The old 30-second iat freshness check assumed generation AFTER restore and cannot
serve a preloaded immutable credential. The reviewed replacement requires exact
900-second exp-minus-iat, correct HS256 signature, t18_reader role, stockinsider-t18
audience, issuance no more than5 seconds ahead, and at least 300 seconds remaining AFTER restore
before CONFIGURE. A restore that consumes over roughly 600 seconds therefore
refuses the app phase; it does not refresh, extend or silently replace the token.
The fixed HTTP exercise remains bounded and checks the signed token unexpired
again before accepting, so cached Next HTTP200 cannot extend credential lifetime.
Root keeps no host secret file; HMAC never enters APP's systemd credential.
Mutable secret copies are wiped where owned, FDs close on failure/cleanup; no
claim is made to erase Python immutable strings or kernel IPC copies in place.

## Invocation and phase meanings

```sh
# Root onsite only; no backup key/manifest/cipher/PG/app server.
/usr/bin/python3 -I -B /run/stockinsider-t18-host-source/scripts/staging_t18_host.py admission

# Fixed wrong-key negative. Supply only the previously trusted manifest digest.
/usr/bin/python3 -I -B /run/stockinsider-t18-host-source/scripts/staging_t18_host.py invalid \
  --manifest-sha256 EXPECTED_ORIGINAL_MANIFEST_SHA256

# Existing trusted stdin channel supplies exactly 32 binary backup-key bytes+EOF.
/usr/bin/python3 -I -B /run/stockinsider-t18-host-source/scripts/staging_t18_host.py real \
  --manifest-sha256 EXPECTED_ORIGINAL_MANIFEST_SHA256
```

The digest placeholder is not accepted literally. Use the nonsecret expected
original digest; no key bytes belong in a shell command, env, transcript or
artifact. Do not supply Python source and a backup key through the same stdin.
The real key is read only after the original root/three-unit identity, private
network/capability and reserve checks, with its original 5-second bound and wipe.

Exit0 verifies only the requested phase: prerequisites, expected invalid-key
rejection, or the fixed old-pair daily rollback. Real GAP remains exit3 and must
not be converted into rollback acceptance. Other failures exit2. Fresh staging
JWT creation in data modes is separate from the receipt's backup keyRead field.
No artifact, model, checkbox or receipt grants runtime admission.

Only two public reader tables/11 columns and GET are supported. Fixed releases
169aad1/dd59817 remain pinned, with original stale_readonly data/dates and disabled
actions. Home HTTP200 means liveness; detail/new radar acceptance remains NOT_RUN.
No replacement snapshot, full detail RPC or broader access is introduced.

## Bounds, diagnostics and cleanup

Initial host floors remain 23 GiB disk and 3 GiB available memory, live floors
15 GiB/1.5 GiB. DB/APP/REST retain 768/512/256 MiB, swap 0, 64 tasks, bounded CPU/runtime
and whole-cgroup stop. Shared private network, zero caps, strict RO root,
production denials, fixed RO assets and private 32 MiB /tmp + /var/tmp remain.
Kernel SO_NETNS_COOKIE and actual distinct UIDs/cgroups are reobserved.

The shared strict /proc/self/net/dev observer still requires exactly lo without
AF_NETLINK. Broker address families remain AF_UNIX/AF_INET/AF_INET6. Each broker
failure emits one compiled schema/role/tag record; stdout goes through existing
systemd-run --pipe, stderr remains null. Host capture caps 512 bytes per broker
stream and 1 MiB per DB stream, drains on overflow then refuses. Only exact-schema
allowlisted diagnostics are exported; no raw output, exceptions, paths, SQL,
rows, secrets or journals. Normal exit 0 and post-cleanup cancellation are not
promoted to startup failure. Partial/missing/import-time records may remain
NO_VALID_REFUSAL_RECORD.

Cleanup stops ONLY the three new fixed units and verifies empty cgroups, closes
FD9/material and original owned FDs, closes/removes the root loader socket, then
reconciles owned mounts, mapper and loops before deleting inactive backing files.
The native credential is checked absent after systemd unit cleanup; the launcher
never unlinks/chmods/remounts it or the host global credentials tree. Unknown
loop baselines cannot authorize detaching retained source loops. Active backing
images are quarantined if cleanup cannot be confirmed. Original source, sealed
image and asset copies remain unchanged. Formal service PID/start/active state,
current release and timer inventory must match before releasing the original
exclusive lock LAST. Locked staging accounts remain reserved.

SIGKILL, host crash or power loss cannot execute Python finally. Such events
require coordinator-local inspection of only these fixed staging resources;
no crash-proof cleanup or automatic rerun permission is claimed.

Cloud tests use public bytes, actual kernel seals/SCM/UID refusals, PG17 public
fixtures and owned HTTP mechanics. No privileged root/three-unit/native-systemd
positive was run in Cloud. The native credential/FD9 old-pair route was verified onsite at7811aaa; the new
candidate-detail observation still needs its own true-clone run. Actual stock
detail HTTP and broader read permissions remain NOT_RUN/closed. Prior receipts
do not substitute for admission on a new subject. Build remains separately reported if dependencies are absent.

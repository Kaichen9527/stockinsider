# Contabo capacity and local recovery operations

These tools implement admission and evidence. They do not purchase storage,
delete a release, prune Docker, stop another App, migrate data or authorize a cutover.

## Host inventory and cleanup eligibility

Run `contabo-deployment-inventory.mjs` on `vmi3152467` and save its JSON outside
the release. It reads only deployment identities, paths, hashes, mounts and resource
counts; it never reads environments or secrets. The inventory expires after five
minutes. `contabo-cleanup-preflight.mjs` evaluates only explicit candidates in
`all-app-retention-policy.json`. An unlisted path is retained.

StockInsider keeps `current` and `previous`. TaskBuddy keeps v5.39 and v5.36, but
the required frontend/API/worker migration is owned by TaskBuddy and must have a
verified external attestation before an older TaskBuddy path can even become
eligible. A matching browser-route list alone is insufficient: the retained
frontend must have a working `/api/` binding, its compiled request contract must
match the retained backend, human content approval must be recorded, and isolated
demo data must never be rebound to production. The inventory records Nginx
`server_name`, filesystem and loopback dependencies, including directives placed
inline inside a `location` block.
BabyCalendar, SOHO, databases, Docker/containerd stores and other App data are
protected. Eligibility output is not deletion authorization.

## Resource admission and locks

`contabo-host-resource-check.mjs` counts database restore, documents, peak WAL,
temporary/index space, deployment bytes and local staging as simultaneous disk
allocation. At least 15 GiB must remain throughout; below 20 GiB is a warning.
It also reserves at least 1.5 GiB available memory after the declared workload.
Unknown, stale and fractional budgets fail closed.

`run-heavy-operation.sh` holds both a host-wide heavy-operation lock and a
StockInsider build/restore/backfill lock. It only executes reviewed commands under
the active full-commit release. The capacity check runs while the locks are held.
The hourly systemd watch uses a zero-workload budget to expose reserve pressure;
it does not make space or expand the VPS.

## Standalone release and local backup

Set `output: "standalone"`, run the reviewed production build, then use
`package-standalone-release.mjs` with both the full 40-character source commit
and the full reviewed packager commit. The application runtime is copied only
from the exact source checkout; reviewed verification scripts and deployment
files are copied only from the exact packager checkout. Both tracked trees must
be clean and both identities are bound into the v2 manifest. The destination is
the separate `/opt/stockinsider-standalone/releases/<sourceCommit>` namespace.
The packager copies the traced server, static assets, public assets and bounded operations
scripts; it rejects backup, env, symlink and special-file leakage and writes a
hash manifest. A failed destination is quarantined for inspection and never
replaces a release.

The confirmed backup directory is the StockInsider project root `backup/` on the
Mac. `run-local-backup.mjs` requires a non-secret config under Application Support,
the 25 GiB capacity preflight and an exclusive system-backup lock. The daily
LaunchAgent template runs at 22:30; the hourly freshness check accepts only a
complete set that passed a clean restore and application validation. Sleeping or
offline Macs therefore become overdue. Rotation retains 14 days, four weekly
copies, the latest two and every unique cold archive; it only emits a quarantine plan.

The database dump is initiated by the Mac but runs in the pinned PostgreSQL 17
client image on Contabo, whose IPv6 route reaches the provider's direct TLS
endpoint. A root-only credential and public CA exist only in a unique `/run`
directory for the duration of the dump. They are delivered over SSH stdin, never
appear in a command line, Docker environment, journal or backup artifact, and
must be removed before the database manifest is published. `pg_dump` owns its
single internally consistent snapshot; the IPv4 session pooler is not used for
the long-running export.

The 2026-09-12 compact rehearsal reduced the restored database from about
3.775 GiB to 1,996,641,971 bytes without removing published research facts,
five-year price history or 60-month valuation evidence. A second clean restore
passed the database and application contract. The complete v2 local backup also
restored all eight private documents and decrypted/validated the two provider
credentials without exposing their values.

After removing only reviewed unused Docker build cache and archived SOHO images,
the host measured about 24.05 GiB free. The checked-in capacity budget reserves
3.5 GiB for the database, 16 MiB for current documents, 1 GiB WAL, 0.5 GiB
index/temporary work, 0.5 GiB deployment space and 2 GiB near-term growth. It
projects about 17.1 GiB remaining, above the 15 GiB hard floor. Therefore no
storage expansion is currently required. Re-run the time-bounded measurement
under the heavy-operation lock immediately before restore; a stale estimate is
not cutover admission.

Do not retire Supabase until production restore, provider credential import,
document canary, unique-writer activation and the seven-day rollback observation
pass. No automatic expansion or subscription cancellation exists.

## Exact VPS release archive evidence

`export-vps-release-backup.mjs` accepts only the fixed production host
`5.104.83.211` and one explicit absolute path shaped like
`/opt/<app>/releases/<release>`. It rejects `current`, globs, shell syntax, broad
directories, symlinks and special files. The one reviewed legacy layout
`/opt/minday-admin-console-releases/<release>` is also accepted explicitly; other
flattened `*-releases` paths remain rejected. The remote helper is read-only: it hashes
the release before streaming, emits an embedded tree manifest, hashes it again
afterward and fails if any path, byte count or digest changed. It has no deletion
operation.

Internal relative package links, including `node_modules/.bin`, are recorded as
link metadata and reconstructed without dereferencing them during export. Their
lexically resolved targets must remain inside the archived release and refer to a
declared archived path; absolute and escaping links fail closed. Versioned
`.env.*.example` templates remain ordinary release files, while live `.env` files
are rejected. The sole external
exception is TaskBuddy's `.env.production` link under the reviewed
`taskbuddy-shared-env-production-v1` policy. Its target and contents are never put
in the manifest or tar stream. The restore receipt proves the rebind policy is
known and required; the shared secret remains a separately protected deployment
dependency. Any other live `.env` file or link is rejected.

The reviewed Minday legacy release contains a regular `.env.local`. That file is
also omitted from the archive and represented only by
`minday-admin-env-local-rebind-v1`. Unlike TaskBuddy's already shared link, it is
not release-external yet: cleanup preflight therefore requires a separate
`minday_admin_secret_migration_verified` attestation before this release can ever
be eligible. A verified code archive alone is insufficient deletion evidence.

The SSH tar stream is fed directly to the existing AES-256-GCM backup envelope.
No plaintext tar is written to the Mac. The encrypted artifact and its private
receipt are placed under the project-root `backup/` directory and remain subject
to the 25 GiB budget and exclusive export lock. Run the verifier against that
receipt before considering the archive usable:

```bash
npm run backup:vps-release:export -- \
  "/Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider/backup" \
  "/absolute/private/key-directory" \
  "/opt/example/releases/exact-release"

npm run backup:vps-release:verify -- \
  "/Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider/backup/<receipt>.manifest.json" \
  "/absolute/private/key-directory"
```

Verification authenticates the envelope, extracts into one unique `mkdtemp`
directory, rejects traversal, links, special files and manifest drift, then removes
only that temporary directory. Approved internal links are rebuilt and verified;
tar-provided or unapproved links remain rejected. It emits a second private receipt. Cleanup preflight
requires both receipts, their exact SHA-256 digests and matching host/release
identity; even a successful preflight only reports eligibility and never removes
the VPS release.

## Exact SOHO rollback-image archive evidence

`soho-image-retention-policy.json` freezes every current, retained rollback and
obsolete image ref to its full image/config digest. The groups are disjoint. The
exporter accepts only the fixed 18-ref obsolete set and the fixed production host;
it invokes read-only `docker image inspect` before and after a streamed
`docker image save`. The tar stream is compressed with zstd on the VPS, then
encrypted directly into the project-root
backup and never lands as plaintext on the Mac or VPS.

```bash
npm run backup:soho-images:export -- \
  "/Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider/backup" \
  "/absolute/private/key-directory"

npm run backup:soho-images:verify -- \
  "/Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider/backup/<receipt>.manifest.json" \
  "/absolute/private/key-directory"
```

Verification authenticates the complete archive first, then decrypts and
decompresses it directly into a non-production local Docker Desktop engine. It verifies every restored tag,
config digest, platform and root-filesystem layer chain. It writes no plaintext tar
and removes only the exact refs proven absent from that local engine before the
test. If a local Docker engine is unavailable, already contains any candidate ref
or image ID, or fails the isolated load, the backup is not cleanup evidence.

Production deletion remains a separate, explicit operation. Immediately before
it, recheck all running and stopped containers, compose/systemd/Nginx/cron paths,
and active build processes; also re-verify all protected refs against the policy.
Only the 18 exact obsolete tags (14 unique image identities) from the reviewed
retention policy may be passed to supported `docker image rm`.
Never use `docker system prune`, `docker image prune`, force removal, a repository
wildcard or an image ID. Measure disk and the full 27-container health set before
and after.

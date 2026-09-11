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
the required API/route migration is owned by TaskBuddy and must have a verified
external attestation before an older TaskBuddy path can even become eligible.
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
`package-standalone-release.mjs` with a full 40-character commit. The packager
copies the traced server, static assets, public assets and bounded operations
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

The current encrypted export is useful evidence but is not a complete recovery
set because the strict clean restore and application validation have not passed.
Do not retire Supabase, run database cleanup or start a Contabo restore until those
gates pass and the current host has enough space. No automatic expansion exists.

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

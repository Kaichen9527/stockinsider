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

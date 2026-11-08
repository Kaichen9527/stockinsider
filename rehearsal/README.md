# StockInsider isolated fixture recovery drill

Source: `6428918f540d5d088814be324ab8578c0cb41e4e`.
Both runners are byte-identical to tested local commit `6d5566d`.
Runtime paths, executor identity, UID and process IDs are omitted from published receipts. Published code branch: `codex/stockinsider-staging-recovery-drill`.
The fixture execution used no SSH, production credentials, native HOLD,
writer activation or application API calls. All SQL belongs to newly created
fixture databases in a fresh nonroot private PGDATA, with Unix socket only.

## Source-entry audit (read only; never executed)

| Entry | Boundary / reason not reused |
|---|---|
| `scripts/export-local-database-backup.mjs` | Fixed real Supabase project, reads credential env and stages remote credentials by SSH; forbidden here |
| `scripts/export-contabo-database-backup.mjs` | SSH export of current real `stockinsider` database; forbidden here |
| `scripts/rehearse-local-database-restore.mjs` | Useful fresh Unix socket cluster pattern, but real encrypted backup/key inputs and platform-specific tools |
| `scripts/rehearse-contabo-database-restore.mjs` | `/opt/homebrew/bin`, real encrypted backup/key, portable roles/migration contract; not suitable for fixture-only run |
| `deployment/vps/prepare-contabo-postgres.sh` | Root, `pg_createcluster 17 stockinsider`, port 5432, system paths; forbidden |
| `deployment/vps/restore-contabo-database.sh` | Root, fixed `stockinsider` cluster 5432, pg_ctlcluster start/stop, restores stage DB, migrations, renames DB; forbidden |
| `deployment/vps/activate-contabo-cutover.sh` | Reads `/etc/stockinsider/data-plane.env`, writes data-plane SQL, operates web/worker/PostgREST units and legacy service; forbidden |
| `deployment/vps/activate-writer-release.sh` | Writes `/etc` writer env/drop-in, restarts real units and calls writer activation API; forbidden |
| `scripts/package-standalone-release.mjs`, `verify-standalone-release.mjs`, `vps-release-tar.mjs` | Packaging/verification, not a parameterized isolated release switch and rollback manager |

The rehearsal mirrors health-gated rollback and uses an atomic private release
pointer. It does NOT execute repo deployment scripts or deploy the StockInsider
application. A full app build adds no evidence for this fixture transport and was
not run; app source is unchanged. `fixture-schema.sql` is an exact extraction of
public `stocks` and `stock_signals` definitions, not the full Supabase schema.

## Evidence and limits

`evidence/receipt.json`: direct successful run, versions, hashes, constraints,
transitions, duration/capacity, cleanup. `evidence/acceptance.json`: acceptance
scope and remaining gaps. The custom archive and TOC are retained privately in the original Cloud worktree; neither is published.
The fixture data hash is stable; pg_dump archives/TOCs include run-specific metadata
and therefore each run has its own SHA256. `official-tool-packages.json` records
Debian package versions/URLs and SHA256 values checked before extracting tools.

VM run: per-child hard RLIMIT_AS 512MiB, CPU 45s, file size 64MiB, 64 file
descriptors; command timeout 25s and parent wall deadline 180s. Private-tree disk
usage is sampled every 0.2s with a 512MiB termination threshold, NOT a hard quota.
There is no dedicated aggregate RAM cgroup here. Final run reaps its direct
postmaster child and closes HTTP/socket listeners, then removes its temp tree.
Five earlier stopped postmasters are defunct children held by PID1; these cannot
be reaped by this non-parent user. They have no live execution or listeners.

CHECK casts are equivalently rewritten by PG17 dump/restore; exact expression
text equality is not asserted. Structural constraints, non-CHECK definitions,
row hashes, PK/UNIQUE/FK and market/freshness rejection cases are verified.

Corrupt archive rejection uses the previously trusted SHA256 before TOC/createdb;
it is not a digital signature or independent backup key escrow validation.
Rollback restores A into a NEW database and switches the fixture pointer; no
reverse migration and no overwrite of an old release or database is performed.

## Coordinator-only Contabo procedure (not remotely executed)

Prerequisites: review all three scripts/data files and SHA256SUMS; PostgreSQL 17
server/client tools at `/usr/lib/postgresql/17/bin`; Python 3, bash, systemd-run,
a dedicated nonroot staging account with a functioning user manager, delegated
memory/pids/CPU controllers and supported user/mount/network namespaces.
No sudo inside the launcher. No changes to any system unit or system cluster.

Copy the reviewed `rehearsal` directory locally through your separately approved
delivery process to `/var/tmp/si-fixture-bundle-<id>` (account-owned; no symlink).
Do not invoke any production entry listed above. As the nonroot staging account:

```sh
umask 077
mkdir -m 700 /var/tmp/si-fixture-output-<id>
bash /var/tmp/si-fixture-bundle-<id>/contabo-launch.sh /var/tmp/si-fixture-output-<id>
```

Replace `<id>` explicitly. Output parent must be new/private and owned by the
account. Verify checksums against the reviewed package first. The launcher uses a
unique transient USER unit only, never the production system manager. It requires
private loopback-only networking, read-only system/home protection, no privilege
escalation, 256MiB private `/tmp` tmpfs, 768MiB aggregate MemoryMax, no swap, 32 tasks,
100% CPU quota, 180s RuntimeMaxSec, 15s stop bound, KillMode=control-group, 64MiB
per-file output cap and core dumps disabled. Total PGDATA/temp disk is hard bounded
by tmpfs; output is outside tmpfs and is separately bounded per-file, not a total
output filesystem quota. It writes only the new output subtree and private tmpfs.

Strict mode independently checks actual tmp filesystem capacity, loopback-only
interfaces and cgroup memory/pids limits BEFORE starting PostgreSQL. Unsupported
properties or failed evidence checks must fail closed. Do not remove sandbox
properties, add capabilities or fall back to production tools/paths. This launcher
was syntax checked; full user-systemd execution is NOT validated in this VM
(no user bus). Coordinator must inspect the resulting unit/receipt locally before
claiming Contabo acceptance. Namespace or cgroup setup failure is a blocker, not
permission to execute without limits.

On ordinary completion, inspect receipt cleanup and SHA256/TOC. On timeout/OOM,
the transient unit kills its complete cgroup; absence of a receipt is a failed
run. The private tmpfs disappears with the unit. Preserve the unique output for
review; remove only that exact fixture output and reviewed bundle when finished.
No automatic cleanup touches `/opt`, `/srv`, `/etc` or any existing database.

## Cloud-only reproduction

```sh
python3 recovery-drill.py --pg-bin /absolute/PG17/bin --output /tmp/new-fixture-receipt-directory
```

This ordinary mode has the explicitly weaker aggregate limits documented above.
The Contabo launcher always supplies `--require-hard-sandbox`; ordinary mode is
not an approved Contabo fallback.

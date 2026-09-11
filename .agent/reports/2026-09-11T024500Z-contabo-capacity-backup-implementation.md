# Contabo capacity, standalone release and local backup implementation

## Outcome

- Implemented read-only all-App identity inventory and fail-closed cleanup eligibility analysis.
- Implemented disk/RAM peak admission with a 15 GiB hard reserve and 20 GiB warning.
- Implemented host-wide and operation-specific locks for build, restore and backfill.
- Enabled Next.js standalone output, release packaging, content manifesting and startup verification.
- Implemented serialized local backup orchestration, complete-set admission, 24-hour freshness and guarded retention planning.
- Implemented fixed-host, exact-release archival from the VPS to the confirmed
  project-root backup: read-only before/after tree hashes, direct AES-GCM streaming,
  unique temporary restore verification and private receipts.
- Cleanup eligibility now verifies the receipt files, receipt hashes, release
  identity and restored tree instead of accepting digest-shaped placeholders.
- Exact-release backup now preserves safe internal relative package symlinks.
  TaskBuddy's single reviewed external environment link is represented only by a
  redacted rebind policy; its target and secret bytes are never archived.
- Added hourly VPS capacity-watch and daily/hourly macOS LaunchAgent templates.
- No VPS service was stopped, no file/image/volume was deleted, no expansion was purchased, and no production migration or deploy was performed by this change.

## Runtime evidence

At `2026-09-11T02:38:18Z`, the production VPS reported:

- root filesystem total: 76,887,154,688 bytes;
- root filesystem available: 10,593,890,304 bytes (about 9.87 GiB);
- memory available: 4,386,107,392 bytes;
- swap free: 0 bytes;
- 27 Docker containers running;
- StockInsider web and isolated financial parser active.

The current disk state is below the 15 GiB migration/backfill reserve, so the new
guard correctly blocks a restore or other declared heavy operation. It does not
automatically order storage or reclaim another App's files.

The real local production build completed successfully. Its standalone tree is
about 47 MiB before release metadata, versus about 662 MiB for the full development
`node_modules`. A packaged test release was 49 MiB on disk, 39,156,265 manifest
bytes, 2,309 files, with `app/server.js` as the verified entrypoint. The temporary
test release contains no production credentials and is not a deployable commit.

## Verification

- `npm run test:contabo-capacity-backup`: 41/41 passed, including traversal,
  internal-link reconstruction, absolute/unapproved link rejection, secret
  redaction, changed-content, fixed-host/path and no-persistent-plaintext cases.
- `npm --prefix web run lint -- --quiet`: passed.
- `npm --prefix web run build`: passed, including TypeScript and 84-page generation.
- `bash -n` for the operations wrapper and schedule installer: passed.
- `plutil -lint deployment/macos/*.plist`: both templates passed.
- Actual standalone packaging and content manifest: passed.

## Production gates still open

- Cleanup candidates are intentionally empty until exact archive/restore receipt hashes and TaskBuddy's external `taskbuddy_api_migration_verified` attestation exist. Eligibility is not deletion authority.
- The exact release archiver and verifier are implemented, but no production VPS
  release was archived or deleted in this change. Each candidate still needs a
  real encrypted artifact plus a successful restore receipt under the confirmed
  Mac project-root `backup/` path.
- Existing encrypted database, Storage and provider artifacts are not a complete system backup. The strict clean restore and application-level validation still must pass after the Contabo data-plane compatibility work lands.
- The macOS LaunchAgents and hourly capacity timer are templates only; installation is a separate reviewed production action.
- The standalone unit is a reviewed template and has not replaced the active service.
- Available VPS disk is below the declared migration floor. A verified cleanup or user-approved expansion is required before restore/backfill/cutover.
- This branch is based on the pre-PR210 main. Integrate it after the reviewed PR210 dependency/security line without reverting those versions.

## Exact production release cleanup evidence

After the implementation verification above, the primary production operator ran
the exact-release workflow for two independently reviewed candidates. This section
records that operational evidence; the branch's tooling itself still has no delete
capability.

### TaskBuddy `4ed658f9d1c5`

- Remote path: `/opt/taskbuddy/releases/4ed658f9d1c5`.
- Export tree: `0a5c01912e6a975ee8afc91f6cbb14723a53c42576fd085278ad362f4f9ca09e`;
  24,668 regular files, 43 safe internal symlinks and 729,994,412 file bytes.
- The external `.env.production` deployment link was represented only by
  `taskbuddy-shared-env-production-v1`; zero external secret bytes were archived.
- Encrypted export receipt SHA-256:
  `a574363cc1330279ab716e529506c284f8119d25dfe0c95ceaaf957e0467e53b`.
- Independent restore receipt SHA-256:
  `7958614264b567de10e533242b3d59166faf12799c0b5df400c75c0e7d4f317d`.
- The authenticated restore reproduced the exact tree and removed only its unique
  restore temporary directory.

### Minday Admin `20260803T153606Z`

- Remote path: `/opt/minday-admin-console-releases/20260803T153606Z`.
- Export tree: `9314e567a5170359fe89b6df47437af957bd124cbe9f1bac2ba5c350bf301a00`;
  10,577 regular files, 9 safe internal symlinks and 679,844,041 file bytes.
- The release-local `.env.local` was omitted and represented only by
  `minday-admin-env-local-rebind-v1`; zero redacted secret bytes were archived.
- Encrypted export receipt SHA-256:
  `d4a66a4d2dd39dfd68282afe9e3edd9ec2f41dd9b8c53c905665ef88fa75195f`.
- Independent restore receipt SHA-256:
  `3e1a3121ea0797ec1566695a0006526490096c42ea34e18ab0760e3ce4edff52`.
- The authenticated restore reproduced the exact non-secret tree and verified the
  explicit deployment-secret rebind plan before removing only its unique restore
  temporary directory.

The post-export reference scan at `2026-09-11T04:37:19Z` found no exact references
to either candidate from process CWD/executables/open file descriptors, `/opt`
deployment symlinks, Docker mounts or compose path labels, systemd, Nginx or cron.
Container environments and secret values were not inspected. The primary operator
then removed only those two paths and measured 1,499,475,968 filesystem bytes
recovered. That filesystem delta is intentionally reported separately from the
1,409,838,453 bytes represented by regular files in the two authenticated trees.

At `2026-09-11T04:53:43Z`, an independent read-only post-cleanup check confirmed:

- both exact paths no longer exist;
- the root filesystem has 18,147,229,696 bytes available (about 16.90 GiB), above
  the 15 GiB hard reserve but still below the 20 GiB warning threshold;
- all 27 Docker containers remain running, with none reporting `unhealthy` or
  `restarting`;
- a second scan found no process, Docker mount/compose, `/opt` symlink, systemd,
  Nginx or cron reference to either deleted path.

Six unrelated systemd units remain in the host's failed-unit list, including four
StockInsider Taiwan-data jobs plus `cloud-init` and `systemd-networkd-wait-online`.
This cleanup neither caused nor cleared those states; they remain a separate
production-health item and must not be described as “all systemd services healthy.”

## Quarantined interrupted export

The project-root backup directory contains one unpublished file:
`.partial-7c56a7fe-2359-4c9a-8a3a-e7264f97cccb`. It is the incomplete encrypted
output left when the earlier diagnostic export of
`/opt/taskbuddy/releases/36cef2ea5b4b` was interrupted before the exporter's
`finally` cleanup could run. Read-only inspection found:

- 211,179,576 bytes, mode `0600`, modified `2026-09-11T04:04:17.415Z`;
- the expected `SI-BACKUP-1` encrypted-envelope magic and context hash
  `ff957795a30e3e82a01ecaa204dd803b5dd3c6b82198f85fad61444488efcc8c`;
- file SHA-256
  `11b050bc0005b3a4b1f9af3f2b945c5b4a9f2b8def0de25b1579254c408d194a`;
- no open file descriptor, no exporter lock, and no matching manifest or completed
  backup receipt.

It is therefore not a usable backup and is not counted as cleanup evidence. It was
left in place as a precisely identified quarantine candidate; no additional file,
image, volume or container cleanup was performed during this reconciliation.

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

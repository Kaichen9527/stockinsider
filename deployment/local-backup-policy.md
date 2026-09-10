# Local backup amendment — 2026-09-10

The user selected the local Mac instead of Backblaze B2. No B2 account, payment
or login is required for this delivery. This replaces the B2/14-daily/4-weekly
proposal with a provisional 25 GiB capacity budget and latest/previous copies.

The user requested `/backup`. Creating that exact path returned `Read-only file
system` on macOS. Do not modify the sealed root, synthetic mounts or system
protection. `/Users/kaerchen/backup` has been proposed; the destination remains
unconfirmed until the user accepts that path or supplies another writable path.
Do not silently put sensitive data in the repository, iCloud or the VPS instead.

## Admission and safety

- A dedicated local directory must be user-owned, mode 0700, and outside Git.
- `node scripts/local-backup-preflight.mjs ABSOLUTE_DIRECTORY INCOMING_BYTES TEMPORARY_BYTES`
  inventories existing files without exporting, deleting or changing permissions.
- All retained copies, the incoming copy and peak temporary allocation count toward
  the budget. Unknown byte estimates fail closed. Run preflight again under the
  eventual backup lock; it is not an atomic reservation or a successful backup.
- Stream encrypted consistent exports where possible. The recovery key is stored
  separately, not committed or bundled with its only encrypted copy.
- Bind database snapshot, documents, hashes, migration and key versions in one
  manifest. A capacity PASS is not hash verification or a restore-test PASS.
- Publish a completed backup only after validation; retain the previous verified
  backup on export/transfer failure. No pruning is implemented by the preflight.
- Mac unavailable/asleep means backup overdue, not success. Alert on stale backup;
  a reliable 24-hour recovery-point target depends on the Mac being reachable.
- Do not retire Supabase until export completeness and a clean-environment restore
  are verified. The seven-day database rollback observation remains separate from
  the removed stock Shadow policy.

## Still required

Destination confirmation/creation, secure export access, the encrypted exporter,
actual document inventory, consistent snapshot transfer, independent recovery-key
storage, automated scheduling and a real restore rehearsal are not completed by
these preflight checks. Do not claim a backup exists from this document or its tests.

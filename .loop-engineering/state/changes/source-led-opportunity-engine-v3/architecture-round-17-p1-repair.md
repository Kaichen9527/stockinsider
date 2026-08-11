# V3.14 Architecture Round 17 P1 Repair

Both release-boundary findings were repaired together.

- Added `scripts/opportunity-v3/apply-reviewed-migrations.mjs`. It requires an exact
  clean source commit, its direct-child exact-review attestation, recorded V3.14
  production migration authority and the Keychain database reference. It rejects a
  non-additive chain, holds one advisory lock, applies the exact base→V3.12→V3.13→
  V3.14 order and verifies the applied catalog without serializing credentials.
- Added the package command `db:v3:apply-reviewed` and made `db:v3:plan` return that
  command only when production migration authority is true.
- Updated the active runbooks with mandatory credential rotation, exact Web release
  SHA/runtime-manifest values, two terminal producer runs, compatibility activation
  and coordinated Vercel/runtime/scheduler rollback.
- Extended the existing V314-008 owner so the migration seam, secret boundary,
  release variables and rollback instructions cannot silently disappear.

Local closure evidence: V314 owner suite 23/23 PASS; migration plan reports the
four additive files, `applyAuthorized:true` and the dedicated reviewed command; the
CLI module exposes exactly four migrations and rejects incomplete arguments.

Production remained untouched. Fresh Architecture Round 18 is required.

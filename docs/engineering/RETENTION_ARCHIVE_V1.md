# StockInsider retention archive v1

Retention v1 replaces the former cleanup script that could delete live rows
after an unverified JSONL copy. It is intentionally split into four gates:

1. `retention_archive_eligibility_v1` freezes a bounded terminal closure and
   rejects active references or explicit pins.
2. `archive-terminal-run-closure.mjs --export` reads that closure in one
   repeatable-read transaction, hashes the PostgreSQL `jsonb` representation,
   writes an AES-256-GCM archive below the repository-root `backup/retention/`,
   decrypts it again and records the export receipt.
3. `--export --verify` additionally restores every row into a different
   PostgreSQL database and records a matching row-count/schema/closure receipt.
4. `retention_archive_deletion_readiness_v1` rechecks current pins and exact row
   hashes. There is no deletion RPC in this release. A later reviewed executor
   must consume only a `ready=true` receipt and must preserve immutable-table
   triggers rather than bypassing them.

## Policy

- Operational detail is eligible after 30 days.
- Run summaries are eligible after 90 days.
- Failed, partial, warning, error, security, audit, unresolved and
  recovery-required records remain online.
- Candidate research runs referenced by latest/prior or published decisions,
  source ledgers referenced by mentions, facts referenced by detail revisions,
  dossier revisions, last-good Radar releases and the preceding valid Radar
  recovery snapshot for every public window are pinned.
- An operator can append a manual/security/recovery pin event. Releasing a pin
  appends another event; pin history is never updated in place.

## Commands

The CLI never reads `.env` and never accepts a password argument. Supply the
source database URL and CA through the process environment. Export also
requires an absolute, non-symlink 32-byte key file whose mode is `0600`.

```bash
npm run db:retention-archive:plan
# The plan lists v1 and v2 in their enforced order. Apply both only from a
# clean, independently reviewed commit:
npm run db:retention-archive:apply -- --source-commit <40-hex-commit>
npm run retention:archive:preview -- --root-kind worker_job_run --root-id UUID
npm run retention:archive:export -- --root-kind worker_job_run --root-id UUID
npm run retention:archive:verify -- --root-kind worker_job_run --root-id UUID
```

Environment variables:

- `STOCKINSIDER_ARCHIVE_DATABASE_URL`
- `STOCKINSIDER_ARCHIVE_CA_FILE` for a remote source
- `STOCKINSIDER_ARCHIVE_KEY_FILE`
- `STOCKINSIDER_ARCHIVE_VERIFY_DATABASE_URL` for `--verify`
- `STOCKINSIDER_ARCHIVE_VERIFY_CA_FILE` when the verification database uses a
  different CA

The verification database must be a local, disposable PostgreSQL database with
a different server/database identity from the source. Its restored schema is
named from the immutable archive manifest ID. The source URL may be remote, but
the verification target is deliberately restricted to loopback so archived
data cannot be copied to an accidental third-party host.

## Recovery and deletion guards

Deletion is not ready unless every condition remains true:

- the root was terminal for the policy period;
- every member of the complete child closure was exported;
- archive envelope authentication, row counts, per-row hashes, relation counts,
  schema hash and closure hash passed;
- an independent PostgreSQL logical restore passed;
- no latest, prior, recovery, release, decision, fact, revision, security,
  unresolved or manual pin applies;
- every live row still has the exact hash recorded at export time;
- the future deletion executor is separately reviewed and authorized.

The archive locator is relative and restricted to `backup/retention/*.sira`.
Archives are private local files and are excluded from Git and deployment.

## Retention v2 capacity extension

`20260911_retention_archive_v2.sql` adds a conservative plan for the six large
legacy producer detail relations. It does not replace the v1 receipts and does
not add a deletion executor.

- Successful run details remain online for at least 30 days and source-related
  details remain through the complete 7+28 day discovery window (35 days).
- Run summaries remain online for at least 90 days.
- Failed/cancelled runs, unresolved/security diagnostics, direct relational
  references, explicit pins, public revisions/facts and UUID references found
  in other public JSONB columns block eligibility.
- The v2 content-addressed representation stores canonical JSON bytes once and
  records per-row identity references. Compatibility RPCs read live legacy rows
  first and only fall back to the normalized representation.
- `materialize-legacy-content-v2.sql` is a non-destructive rehearsal helper. It
  refuses every network-backed PostgreSQL server and every data directory/user
  except the disposable local restore identity. It never deletes source rows.
- Connector candidate planning is set-based in v2; it materializes the pin and
  audit sets once instead of rebuilding the full graph for every candidate.

The capacity rehearsal result is recorded in
`.agent/reports/2026-09-11-retention-v2-capacity-rehearsal.md`. A production
normalization/cutover and any source-row deletion still require separate review.

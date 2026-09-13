# Exact implementation review — back up the current Contabo database

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `2a6281d50ea10248bcbaeb5bfd6e9f40ee8eb393` / `731596bedf2d64c922c64a702e52dac733ca2632`
- Full final range: `0d869f4d234cda931cd4fc18fe3145d0cc5eaf4e..2a6281d50ea10248bcbaeb5bfd6e9f40ee8eb393`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed all six changed files against the protected base and exercised the implementation on the current Contabo production database. PostgreSQL authentication remains on the VPS Unix socket under the postgres operating-system account; no database password enters SSH arguments, files, logs or backup metadata.
- `pg_dump` owns one internally consistent snapshot. Its stdout streams through SSH directly into the existing authenticated AES-256-GCM envelope. Only private encrypted bytes and a non-secret manifest are persisted in the user-approved project-root `backup/` directory; no plaintext archive is written.
- The new v3 manifest binds the current Contabo source, transport, database size, PostgreSQL version, encryption context and explicit credential properties. The restore path accepts that schema only when all closed transport and ownership fields match.
- A production backup correctly contains an enabled writer identity fence. The disposable Unix-socket-only rehearsal now clears the fence and activation metadata only in the restored copy, satisfying the table check constraint and preventing the rehearsal from inheriting production authority. The encrypted source and production database remain unchanged.
- Live evidence: the 2,020,161,203-byte current database produced a 435,184,362-byte authenticated archive. Envelope verification and `pg_restore` decoding passed. A clean PostgreSQL 17 restore passed with 249 public tables, 236 public functions, 68 triggers, 192 RLS tables, 51 policies and all application, role, RPC and writer-fence checks.
- Thirty-nine backup, encryption, restore, retention and path-safety tests passed, and `git diff --check` passed. No archive or production row was deleted, no backup was pruned, and no provider credential was printed. No unresolved P0, P1 or P2 finding remains.

## Production boundary

This review authorizes the exporter and restore contract only after all protected checks pass and the PR is merged normally. The database archive alone is not a complete system backup: private artifacts, recovery-key independence and provider recovery validation remain separate backup-set gates. Ruleset `20177392` remains enabled.

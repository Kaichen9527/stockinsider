# Exact implementation review — standalone release admission

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

Reviewer: Codex reviewed the exact diff and executed the checks below. This session also authored the repair, so this document is not represented as independent author review; the protected Code Gates remain mandatory.

## Exact reviewed identity

- Final reviewed repair/tree: `110a7197afadfca6fd4f570c68a9c216d11aa9b4` / `fb62be71161857affbaa8ea8ed7f4d7921a4b3c9`
- Full final range: `0f1a1a0d2dad10e29c92931e043adef305b19a07..110a7197afadfca6fd4f570c68a9c216d11aa9b4`
- Active graph: `722095adecd208b54cc794f72e262dd5b77ed970da80f0ab5771a55259651625`
- Scope: three deployment-tool files: standalone packager, packager tests and release verifier. No product, database, article, research or publication logic changes.

## Review conclusion

Next.js 16's standalone output can already contain `.next/static` and `public`. The former packager copied the same files again with `errorOnExist`, so a production build failed packaging. The repaired packager accepts an existing asset directory only if its complete sorted path, byte-length and SHA-256 inventory equals the authoritative source directory. A missing directory is copied as before. Extra, missing or changed bytes, symlinks and special files still fail; the final release manifest binds each packaged file's mode and hash. Comparing contents instead of source modes is necessary because recursive copy can normalize mode bits under the host umask.

The systemd release preflight invokes the verifier via `/opt/stockinsider/current`. The former CLI path comparison could silently skip verification when Node resolved that symlink to the physical module. The verifier and packager CLI now compare physical paths, and child-process tests require a structured failure rather than a zero-output success when called through symlinks. This restores admission enforcement without relaxing the release manifest or Git identity checks.

## Reproduced verification

- Standalone packager tests: seven passed, zero failed; includes identical bundled assets, mismatched static and public assets, both symlinked CLI entrypoints, manifest tampering and Git identity failures.
- A real Next.js production build was packaged from this exact commit, yielding 2,575 files and 59,538,520 bytes; the release verifier returned `releaseVerified: true` with manifest SHA-256 `a4aca4782335a9b9da9387f63c39637adc0e4da6a2416574c6d80be884e037c3`.
- Product-correctness suite: 155 passed, zero failed/skipped/todo. Its actual stdout SHA-256 and all 31 passing PCR case names are bound in `pcr-fulfillment-record-v1.json`.
- TypeScript, lint and production web build passed. `git diff --check` passed.

## Release boundary

This code review does not approve a production cutover. The protected root gate must pass, and the Contabo resource check must allow the declared workload before the release is copied, migrations run or a service is switched. The latest check still blocks on disk reserve. Full official data backfill and candidate conservation remain required after capacity is resolved.

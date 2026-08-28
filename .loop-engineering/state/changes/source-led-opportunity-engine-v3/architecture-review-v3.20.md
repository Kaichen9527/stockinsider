# V3.20 fresh Architecture review — KOL-first runtime recovery

Date: 2026-08-29

Review authority: one independent, read-only Architecture review after the
V3.20 Requirements PASS. No production database, scheduler, Vercel project,
provider, Safari state, LINE, dispatch, automatic trading, Promotion, or
evaluation-governance state was mutated.

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Requirements-reviewed parent/tree: `c783f8171233efd77adf21405fe91723e48b318c` / `9b87d174de9c71cf5dac9e6e59d68f3d0ad3fd6c`
- Final reviewed implementation commit/tree: `2ee6b3b843fdc52473bc28135e5b406191f84eda` / `0ef23dc6e92a076e2bc60c13de9ae803ea39dbd9`
- Full reviewed implementation range: `501dc2fba28d06731a85469ba3fbc4b8f250528c..2ee6b3b843fdc52473bc28135e5b406191f84eda`
- Active graph: `13081345293dcb3306c68420270ca82ea090fa18a0ecb878ccd8da08d63e0587`

## Architecture result

- The worker is a single restartable DAG. Source acquisition freezes bounded
  inputs first; subsequent claims, 60→30→20 selection, facts, valuation,
  decision and compact projection consume those immutable inputs. A provider
  retry cannot silently refetch and alter an existing cutoff.
- The V3.20 reaper has an exact identity gate and writes a durable,
  allowlisted diagnostic before a lease-expired terminal. It is distinct from
  normal cancellation and does not grant the runtime role table privileges.
- `CandidateNominationAuthorityV320` forms the only nomination boundary.
  Official market observations and retention ledgers are downstream validators
  only. The compact projection repeats that boundary, so stale legacy cards
  cannot revive through a compatibility path.
- Five acquisition connectors have one explicit terminal outcome per
  expected pair. Rights and transcript availability are checked before claims
  can affect a thesis; protected content is represented only by structured,
  attested facts and citations.
- The Web reads the compact projection on the request path and overlays health
  without changing decision bytes. Every visible candidate has exactly one
  readiness lane and a revision-bound dossier or safe research-only detail.
- The active artifact catalog now declares the V3.20 amendment, and the
  protected root selects V3.20 review evidence for that graph rather than
  accepting semantically unrelated V3.19 proof.

## Verified evidence

- Product/runtime: `149/149` PASS; migration contract/rehearsal: `74/74`
  PASS; source-led core: `63/63` PASS; legacy V1/V2: `2/2` PASS.
- Browser correctness: `9/9` PASS; performance: `5/5` PASS; typecheck, lint,
  production build, protected-worker tests and `git diff --check` PASS.
- The review inspected the range for authority widening, full-market
  nomination regressions, lease terminalization holes, SQL owner/privilege
  drift, source-rights leakage, stale action authority, decision revision
  mismatch, and API compatibility. No P0/P1/P2 finding remains.

This PASS authorizes exactly one exact-commit review. It does not authorize
production migration, runtime activation, Vercel deployment, a claim of
future returns, or any prohibited action.

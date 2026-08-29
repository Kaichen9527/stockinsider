# V3.20 fresh Architecture review — catalog-integrity repair

Date: 2026-08-29

Review authority: one independent, read-only Architecture review after the
V3.20 catalog-integrity Requirements PASS. No production database, scheduler, Vercel project,
provider, Safari state, LINE, dispatch, automatic trading, Promotion, or
evaluation-governance state was mutated.

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Requirements-reviewed parent/tree: `ef3dbb25a599e9d132aec24041ddca96f244e003` / `4956500b66ae588059dfd71ff8125fd5aff54194`
- Final reviewed implementation commit/tree: `01599c20d11044c0d0bac730df393c5c383ff78c` / `8386474b92f1f8a1e95c0b895258f31f77d1f334`
- Full reviewed implementation range: `681abfb09e13596fe7185b1ae090229b2fd29a63..01599c20d11044c0d0bac730df393c5c383ff78c`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

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
- The active artifact catalog now has one internally consistent authority
  declaration: executable byte digest, active-file count, owner count and the
  two GOV-004 design/evidence declarations are updated together. The repair
  does not alter the KOL-first data flow, public contract or runtime authority.

## Verified evidence

- Product/runtime: `149/149` PASS; migration contract/rehearsal: `74/74`
  PASS; source-led core: `63/63` PASS; legacy V1/V2: `2/2` PASS.
- Browser correctness: `9/9` PASS; performance: `5/5` PASS; typecheck, lint,
  production build, protected-worker tests and `git diff --check` PASS.
- The exact focused protected-harness reproduction passes both affected owners:
  `HYB-007` and `GOV-004`. This confirms the repaired declarative authority and
  executable catalog validation describe the same immutable artifact.
- The review inspected the range for authority widening, full-market
  nomination regressions, lease terminalization holes, SQL owner/privilege
  drift, source-rights leakage, stale action authority, decision revision
  mismatch, and API compatibility. No P0/P1/P2 finding remains.

This PASS authorizes exactly one exact-commit review. It does not authorize
production migration, runtime activation, Vercel deployment, a claim of
future returns, or any prohibited action.

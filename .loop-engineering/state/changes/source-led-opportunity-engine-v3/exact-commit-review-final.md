# V3.16.21 production-cardinality exact review

Date: 2026-08-17
Reviewer: independent Sol exact-range SQL, runtime, security, and product review
Final verdict: `PASS`
Findings after repair: `P0=0 P1=0 P2=0`

## Immutable subject

- Reviewed base: `cde4915db22f279a891b478540a2ebdab54876fb`
- Initial cardinality implementation: `05cd33bf405c13f9fe30c6ad7f40b4dc15f54337`
- Final implementation repair: `8a8e4304c52958c2c1c23bfdb4929fbb8a570a5a`
- Final implementation tree: `09a0e7019d13f3ed70f812f917dc99cd2ee9c75d`
- Full reviewed range: `cde4915db22f279a891b478540a2ebdab54876fb..8a8e4304c52958c2c1c23bfdb4929fbb8a570a5a`
- Repair range: `05cd33bf405c13f9fe30c6ad7f40b4dc15f54337..8a8e4304c52958c2c1c23bfdb4929fbb8a570a5a`
- Active graph: `b07516d0b650da847d8e0cba59edf2c25672e88443582a0e696e093a13e80525`

## Production RED evidence and bounded repair

Forensic production run `68691805-c80c-39df-26e5-ae9715d80318` was healthy at
the lease and heartbeat layers, but each official valuation row called the public
symbol resolver. That resolver validates every registered instrument stream before
using the indexed resolver. With 22,448 valuation rows in 1,123 pooler-safe chunks,
the same approximately 1,979-stream validation was repeated twenty times per chunk
and the exact activation could not finish inside four hours.

The activation was deliberately stopped before the installer deadline. Automatic
rollback restored `184390953048209730c22828548858c28fa3b6b7`, Web was not changed,
the one-time authority was destroyed, and no action authority was published.

The repair leaves every official chunk at the reviewed maximum of 20 rows. It
requires one immutable acquisition timestamp per symbol-bearing chunk, performs
one complete roster integrity validation at that exact `fetchedAt`, then invokes
the existing indexed and bounded internal resolver for financial, price and
reported-valuation rows. A mixed timestamp fails closed. All point-in-time cutoffs,
authority-conflict behavior, append functions and transaction-time dependencies
remain byte-identical.

## Exact diff review

- SQL safety: PASS. The new migration is transactional, contains no destructive
  table/schema/type operation, refuses an unknown predecessor shape, applies twice,
  and the ordered migration chain re-applies the final rewrite after every earlier
  predecessor migration.
- Authority integrity: PASS. Full roster validation is reduced from once per row to
  once per immutable acquisition chunk, not removed. The internal resolver retains
  indexed symbol candidate discovery, per-stock registry identity, 64-row stream
  bounds, latest-cutoff selection and equal-head conflict rejection.
- Privileges: PASS. The rewritten function remains owned by
  `opportunity_v3_rpc_owner`; PUBLIC, anon, authenticated and service role have no
  direct execute authority. Only the existing leased, staged REST wrapper remains
  callable by service role.
- Pooler and lease safety: PASS. No chunk-size increase or provider burst was
  introduced. All five official datasets retain the 20-row transaction bound and
  the existing heartbeat renewal behavior.
- Provenance: PASS. Validation uses the truthful frozen acquisition `collectedAt`;
  it neither substitutes the scheduled source cutoff nor backdates `fetchedAt`.
- Retry/idempotency: PASS. Existing staged-chunk and application ledgers are
  unchanged. Same frozen input reuses immutable rows; a conflicting chunk or mixed
  acquisition timestamp fails closed.
- Product and Web: CLEAN. The range changes no valuation formula, decision action,
  public route or component behavior. Last-good visibility and action fail-safe
  from the reviewed V3.16.21 source remain intact.
- Secrets and scope: CLEAN. No credential bytes or dependency artifacts were
  added. Database password reset/rotation, LINE, dispatch, automatic trading and
  Promotion remain outside authority.

## Repair closure

The first clean product trace identified only evidence-harness closure issues: the
new active-graph digest needed resealing and the Loop meta-owner did not reject a
mutated production-cardinality task checkbox. The repair binds the new graph and
requires the pending checkbox while `current-release.phase=architecture_passed`.
The mutation now fails closed. Playwright's initial local failure was environmental
(the clean tree had not yet installed Chromium); after the workflow-equivalent
browser install the exact tree passes the complete eight-case suite and the two
readonly-visibility cases.

- Repair-range review: PASS, `P0=0 P1=0 P2=0`.
- Full-range closure review: PASS, `P0=0 P1=0 P2=0`.
- Active-graph closure: PASS.
- Loop task/status mutation closure: PASS.

## Verification evidence

- Focused V3.16.21 tests: `7/7` PASS.
- Product correctness including all 31 PCR boundaries: `116/116` PASS; stdout
  SHA-256 `533eb2a602e5850f5c82f4235bda4e410f83ee6d380da24ef4e22fc44b3f6f8b`.
- Fresh PostgreSQL migration and lifecycle suite: `60/60` PASS, including apply
  twice, installed-function cardinality, owner and grant closure.
- V3 correctness Playwright: `8/8` PASS; V3.14 readonly visibility: `2/2` PASS.
- Product track: the pre-repair full owner run passed `271/272`; its sole remaining
  HYB-007 task/status mutation finding is repaired and independently reruns PASS.
- Model-runner track: `28/28` PASS in the credential-free exact-subject partition.
- `git diff --check`, JSON parsing and Node syntax checks: PASS.

The protected external root remains the landing authority for the evidence child.
Evaluation governance stays
`blocked/non_fabricated_elapsed_cohorts_unavailable` until the real 120-date,
20-live-date and 252-attempt cohorts mature. This exact review does not claim future
returns are proven and does not authorize Promotion.

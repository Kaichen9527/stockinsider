# Fresh Architecture Gate Review — Round 11 Final Revalidation

Date: 2026-08-04
Reviewer: Codex independent architecture gate review
Review mode: read-only review of the Requirements evidence-carrying immutable tree
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `f32a2e7a8029c5e8348712d475d60b3a4729ebca`
- Final repair-closure commit/tree: `9cc4fe96e1e690aa3aff3946450381b2ee70ec36` / `78d8819374f608b5ef02f8696e5b8cf12c67de34`
- Full reviewed implementation range: `f32a2e7a8029c5e8348712d475d60b3a4729ebca..9cc4fe96e1e690aa3aff3946450381b2ee70ec36`
- Requirements implementation commit: `c01104ce7d0f83ccc893b5aed4030fcba564440a`
- Requirements evidence carrier: `9cc4fe96e1e690aa3aff3946450381b2ee70ec36`
- Active graph: `f03607130c64872d30e24cf42a70ce2336ecd8a1b6c16275917dfdcbd07d0d7e`

This review independently evaluated the current post-rebase architecture and the fresh
Requirements evidence it carries. It does not inherit the obsolete `edbe685` tree or
its evidence branches. The requirements document is evidence-only and does not alter
the active contract graph.

The protected worker and model oracle now originate in the protected base and remain
byte-identical in the subject. Subject preparation uses standalone Git repositories, so
removing a candidate remote cannot remove the base repository's fetched evidence refs.
The protected sandbox resolves its read-only Node toolchain grant from the real
setup-node executable, requires npm to remain inside that exact toolchain root and adds
only the public macOS OpenSSL configuration path needed by Node crypto. This preserves
the deny-by-default filesystem and network boundary while making the pinned host
toolchain executable under the same protected policy.

## Architecture decision

The implementation is an additive, fail-closed disabled-Web architecture. Source
authority, bounded producer mutation, immutable research state and compact public reads
remain separate planes. Migration and shadow packages are prepared but not activated.

### Source and data plane

- The exchange roster feeds an ordered cursor-paginated universe. Explicit symbol and
  alias joins, typed rejections and source accounting prevent UUID inference, silent
  truncation and empty-success connector failures.
- One deterministic DAG freezes occurrence, cutoff, manifests and predecessor identity
  before source sync, extraction, candidate selection, facts, analysis and projection.
- Facts are append-only and point-in-time. Values, units, provenance and as-of authority
  move together; a story timestamp cannot become a financial date.
- Every stage owns a lease, bounded retry and conservation barrier. An interrupted run
  resumes the same logical attempt and cannot replace the last complete projection.

### Research and decision plane

- Discovery is not gated on completed valuation: an out-of-seed stock can surface as a
  non-actionable source signal while deep research remains capped at 60-to-30-to-20.
- Valuation is a sector-aware bridge through diluted EPS and equity value. Evidence
  gaps or disagreement return `valuation_review`, null targets and no buy-like action.
- Technical availability is separate from its seven-state timing enum. Buy-like actions
  require valid trigger/entry/stop geometry; below-support candidates require reclaim.
- BIAS, PE authorities, fundamental quality, relative strength and valuation confidence
  remain explicit inputs. Only material input identity changes append a revision.

### Comparable lineage and recovery

- Comparable ownership is selected globally by greatest earlier cutoff then terminal
  timestamp before a symbol is joined. Therefore an absent symbol yields null rather
  than an older fallback for score delta, change brief or material revision history.
- A tie on the selected cutoff and terminal timestamp is an integrity failure. The
  worker read view withholds the deep/allocation/projection read unit, so no arbitrary
  lineage can be published.
- Discovery continuation and exit rows use the same selected prior owner, maintaining
  one coherent predecessor across the entire projection.

### Runtime, security and read plane

- The Git-tracked producer has a closed transitive bundle. Installation binds reviewed
  commit/tree, worker/config hashes, scheduler owner and rollback target and rejects
  stale or dirty input.
- Producer writes remain behind RLS, a single owner, leases and idempotency. No public
  mutating endpoint is added.
- Compact projections are checksum-verified, indexed and conflict-sentinel protected.
  Radar routes use one bounded projection query and never invoke live providers.
- Internal health is authenticated and non-cacheable. `/api/opportunity-v3` remains a
  precise disabled 404 and cannot access an unmigrated schema.

## Failure and recovery review

| Failure | Closed behavior | Public effect |
|---|---|---|
| Source or authority unavailable | typed terminal failure/rejection | last complete projection remains |
| Cursor, row, byte or conservation overflow | fail before successor creation | no partial candidate publication |
| Worker interruption or expired lease | resume same logical attempt, then bounded retry | no duplicate revision |
| Missing/conflicting valuation evidence | `valuation_review`, null EPS/targets | no buy-like action |
| Below support or invalid entry geometry | reclaim/unavailable/invalid | no fake pullback or invalid stop |
| Comparable lineage tie | withhold worker read unit | no arbitrary prior snapshot |
| Newest projection hash conflict | `projection_conflict` | fail-closed read |
| Producer/consumer identity mismatch | doctor/health failure | activation remains blocked |
| Real cohorts immature | governance blocker | Promotion remains blocked |

## Fresh exact-tree evidence

| Evidence | Result |
|---|---|
| Architecture invariants, range and active graph | PASS |
| Typecheck, lint and production build | PASS |
| Core/product/PCR tests | PASS `59/59`, `31/31` |
| Applied migration/reapply/integration | PASS `25/25` |
| Legacy and Playwright regressions | PASS `2/2`, `2/2` |
| Controlled performance oracle | PASS `4/4` |
| Model-runner and disabled doctor | PASS `15/15`; host-pin v3.5; disabled |

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`. This is the required honest
Promotion boundary, not permission to synthesize elapsed market cohorts.

## Gate decision

`PASS P0=0 P1=0 P2=0`.

The architecture is bounded, recoverable and compatible for the authorized code-only,
disabled scope. This PASS authorizes exact-commit review and protected Code Gate only.
It does not authorize merge, deployment, migration, scheduler change, shadow activation
or production mutation.

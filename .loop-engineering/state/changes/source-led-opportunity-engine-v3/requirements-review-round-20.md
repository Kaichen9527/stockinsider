# Requirements Gate Report — Round 20

## Verdict

**CHANGES_REQUIRED**

- P0: **0**
- P1: **3**
- P2: **0**
- Architecture Gate performed: **No**

Reviewed frozen range:

`12c131aa50ca53268878e9f025973533ac100c49..92a00660ce2c87407be98b357d360aa42dc31beb`

Reviewer session: `019f77b2-3e51-7fd0-816a-9d0457c57bcb`

The baseline is an ancestor of the design head. The range contains 15 commits and 57 changed paths. The worktree was clean and HEAD remained frozen before and after the read-only review.

## Findings

### P1 — Dedicated service-role client acquisition is not an exact executable configuration boundary

The contract did not define the required Supabase URL source/grammar, exact service-key grammar/role identity, fallback precedence, constructor-exception mapping, or the line between offline acquisition failure and remote credential rejection. `OPS-025`/`OPS-026` therefore lacked an exact malformed URL/key/role oracle for their zero-database-call assertion.

### P1 — Human-authority HTTP route and wire contract is conflicting and incomplete

`shadow-evaluation-contract.md` named one base link-audit POST path while `auth-principal-contract.md` named four literal signed paths. Four non-blinded authority operations had no literal paths, and the non-blinded set lacked complete raw/query/body, success, expected RPC failure, unknown-error and cache contracts. `AUTH-003`/`OPS-026` could not enumerate exhaustive route coverage.

### P1 — `enrich_rank` source-run lineage omits static publisher-policy identity

The `source_dataset` header and exact enrich upstream selector omitted `publisherVerificationPolicyHash`. An old-policy source success could therefore satisfy a new-policy enrich request, or old/new successes could produce a false multiple-source failure. This contradicted `OPS-008`, `OPS-009` and `OPS-013`.

## Independently Confirmed Closed Items

- Round 19 dual bearer/principal composition and relative transport/auth/body/client/RPC precedence are present.
- Round 18 source admission and blinded atomic nonce/operation rollback remain closed.
- The exact 31-function catalog, named PostgreSQL types, database-clock reaper and seven-family supersession remain closed.
- Universal manifests, bounded source-led funnel, same-run detail, shadow-only rollout and zero model influence remain closed.

## Inventory Validation

- Version: **1.19.0**
- Declared / actual / unique IDs: **187 / 187 / 187**
- Exact ordered five-field non-empty records: **187**
- Missing, extra, malformed, duplicate, skipped or todo registrations: **0**
- Structural inventory passes; semantic one-to-one coverage is blocked by the three findings above.

## Governance and Read-Only Evidence

- Before and after review: `HEAD = 92a00660ce2c87407be98b357d360aa42dc31beb`.
- Before and after review: worktree porcelain, staged names, unstaged names and untracked names were empty.
- Only read-only repository inspection occurred.
- No Architecture Gate, implementation, test/build, migration, binding, merge, push, deploy or production operation occurred.

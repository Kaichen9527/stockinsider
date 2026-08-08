# Requirements Gate Report — Round 19

## Verdict

**CHANGES_REQUIRED**

- P0: **0**
- P1: **2**
- P2: **0**
- Architecture Gate performed: **No**

Reviewed frozen range:

`12c131aa50ca53268878e9f025973533ac100c49..90e3981ac797a482cdad6c81474874865f753d0d`

Reviewer session: `019f77a4-71cb-7421-a639-3e50e4cb9c7a`

The baseline is an ancestor of the design head; the range contains 14 commits. The worktree was clean and HEAD remained frozen before and after the read-only review.

## Findings

### P1 — Human-authority write authentication conflicts with governing repository policy

`AGENTS.md` requires every Supabase write to pass through `requireInternalAuth()`, while `auth-principal-contract.md` assigned human-authority writes exclusively to `requireInternalPrincipalV3()`. An implementation could not determine whether to use both guards, only the new guard, or a separate governance amendment. Repair must preserve `AGENTS.md` by specifying exact dual-control headers, precedence, wire failures and executable acceptance, or obtain an explicit governance amendment.

### P1 — Blinded-route precedence omits service-role client acquisition failure

The contract requires missing or invalid service-role configuration to fail before database access as `v3_service_role_unavailable`, but the supposedly total four-route precedence skipped client acquisition between body validation and the combined RPC. `OPS-016` expected that code while `OPS-024`/`OPS-025` required a closed two-key link-audit oracle without defining the collision. Repair must place client acquisition at one exact precedence point, define HTTP/code/body/cache/collision behavior, prove no database call or durable write, and cover the collision in `OPS-025`.

## Independently Confirmed Closed Items

- Round 18 discovery admission is one-to-one: non-null identity, RPC-derived current authority/identity/source-key triple, immediate composite FK and full-triple consumer equality.
- Blinded nonce insertion and disposition/label/audit are one transaction; expected and unknown RPC failures roll the invocation back.
- Financial source timestamps, named PostgreSQL types, 31 exact functions, database-clock reaping, seven-family terminal authority collapse and manifest lifecycle exclusions remain closed.
- Discovery is bounded, V3 is shadow-only, same-run detail has no legacy fallback and assistive models have zero decision influence.

## Inventory Validation

- Version: **1.18.0**
- Declared / actual / unique IDs: **185 / 185 / 185**
- Exact ordered five-field records with non-empty strings: **185**
- Missing, extra, malformed, empty, duplicate, skip or todo registrations: **0**
- `AUTH-002` is adequate.
- `OPS-025` does not cover service-role client acquisition, so semantic acceptance remains incomplete.

## Governance and Read-Only Evidence

- Before and after review: `HEAD = 90e3981ac797a482cdad6c81474874865f753d0d`
- Before and after review: worktree porcelain, staged names and unstaged names were empty.
- Only read-only repository inspection occurred.
- No Architecture Gate, implementation, test/build, migration, binding, merge, push, deploy or production operation occurred.

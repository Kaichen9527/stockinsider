# Requirements Review — Round 52

Date: 2026-07-26
Immutable tree: `a5fdb6a71e310de7003d743366f13e3407891079`
Base: `1fe429d3a91359cd2d6d07c89441ebb66d9ccc5d`
Verdict: `CHANGES_REQUIRED`
Counts: `P0=2 P1=4 P2=1`

This was an independent fresh read-only Sol xhigh review of only the named immutable Git tree. The reviewer did not read or modify the mutable worktree.

## Findings

1. `P0` — Canonical URL/document identity still hashed raw variants, retained malformed percent escapes, and could invert the same-time canonical-prior order.
2. `P0` — Acceptance falsely blessed malformed/partially normalized URLs, missed the active design-root v3.9 drift, and did not exercise route-level remote credential mapping.
3. `P1` — Blinded route mapping classified expected `PT403` database authorization failures as remote service-role rejection.
4. `P1` — Ingestion, human-authority, worker and control/status/cron route families did not consistently distinguish pre-function `401|403` from expected `PT403`.
5. `P1` — Source-adapter ordinal language conflicted with the job graph's freshest-first bounded selection.
6. `P1` — The design current-root summary still named job graph v3.9 while the active owner is v3.10.
7. `P2` — Generated schemas, the signed-request helper, copyable examples and CLI help were still unchecked and absent.

## Independent execution evidence

- Product/trace passed `173/173`; migration passed `16/16`; typecheck passed.
- Model runner passed `14/14`; doctor passed with deployment disabled.
- Evaluation acceptance passed `21/21` and focused product tests passed `12/12`, then the formal gate honestly blocked with `blocked/non_fabricated_elapsed_cohorts_unavailable`.
- All eight blinded assignment dispositions, simple staging/result byte equality and empty-normalized-claim behavior passed.

## Repair incorporated after this immutable tree

- URL normalization now rejects malformed percent encoding, removes credentials/fragments/tracking keys, normalizes unreserved escapes, path/trailing slash and query ordering, and makes document identity hash the canonical URL. Malformed candidates terminate as `parse_failure`.
- Source ingestion canonicalizes valid URL candidates before the append RPC; source parse repeats the same normalization before identity derivation.
- One shared remote-credential classifier now maps only unknown pre-function HTTP `401|403` failures to `v3_service_role_unavailable/503`. Exact `PT403` application/database pairs retain canonical public `403` authorization semantics across blinded, ingestion, human-authority, worker and control/status/cron routes.
- Source-adapter ordering now explicitly selects the freshest bounded population first and assigns dataset ordinals separately by canonical source/effective-time/document identity order.
- The design current root and GOV-004 oracle now require job graph v3.10 and reject v3.9.
- Machine-readable closed operator schemas, a secret-safe internal-principal signing helper, copyable request examples and `v3:help`/`v3:schemas` commands are implemented and mechanically covered by GOV-004.
- Repair verification passes typecheck, lint, product/trace `174/174`, migration `16/16`, schema/helper diagnostics and the exact 130/130 acceptance registry.

Architecture remains locked. These repairs require a new immutable tree and a brand-new Requirements review.

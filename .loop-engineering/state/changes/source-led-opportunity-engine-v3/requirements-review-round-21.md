# Requirements Gate Report — Round 21

## Verdict

**CHANGES_REQUIRED**

- P0: **0**
- P1: **2**
- P2: **0**
- Architecture Gate performed: **No**

Reviewed frozen range:

`12c131aa50ca53268878e9f025973533ac100c49..f8155aa7ce6b5a2759fec5a466ff718f23b05a23`

Reviewer session: `019f77c5-13a4-7b31-a3d5-6ca1568ed1d1`

The merge base was the exact baseline. The range contained 16 commits and 58 changed paths. Before and after review, HEAD remained `f8155aa7ce6b5a2759fec5a466ff718f23b05a23` and staged, unstaged and untracked counts were all zero.

## Findings

### P1 — Blinded routes had two conflicting exact error-body contracts

The global five-step rule assigned every human-authority failure `error:'v3_internal_request_rejected'`, while the blinded specialization assigned the same four routes `error:'link_audit_request_rejected'`. No precedence made either byte contract authoritative. The four blinded routes therefore lacked one implementable 422/403/503/RPC/500 response oracle.

Required repair: scope one error literal to each route family, state which rule is authoritative for all five stages, and make `AUTH-005`, `OPS-024`, `OPS-025` and `OPS-026` assert the exact canonical bytes.

### P1 — Remote credential rejection was not closed for the second non-blinded RPC

Each non-blinded route commits `consume_internal_nonce_v3` and then makes a separate append RPC. The contract nevertheless claimed every remote `401|403` was exactly one call and zero durable writes. If the first call commits and the second is rejected, two calls occurred and the nonce remains, so the universal claim was false and the branch had no exact oracle.

Required repair: either combine nonce and append atomically or define both positions. If retaining two calls, rejection on the nonce RPC is one call/zero writes, while rejection on the append RPC is two calls with only the committed nonce retained and zero authority/RPC-audit write. Both require exact status/body/cache fixtures on all seven paths.

## Independently Confirmed Closed

- The dedicated client has one exact four-value no-fallback URL/project-ref/service-key/approved-digest tuple.
- The human-authority catalog has exactly seven non-blinded plus four blinded literal POST paths.
- `publisherVerificationPolicyHash` is bound into its static definition, `source-dataset-v3.1` header/root and exact enrich lineage equality.
- Earlier immutable source revision, knowledge-time, supersession, universal manifest, durable execution, additive storage/RLS, same-run V3 detail, shadow-only and zero-model-influence closures remain intact.
- Implementation, production binding data, migration application, scheduler enablement, deployment and promotion remain unauthorized.

## Acceptance Inventory Validation

- Version reviewed: **1.20.0**
- Declared / actual / unique IDs: **190 / 190 / 190**
- Exact ordered non-empty five-field records: **190**
- Malformed, duplicate, invalid-layer or semantic skip/todo records: **0**
- ID grammar failures: **0**
- Every R1–R11 requirement and Safety has structural coverage.

Structural validation passed, but semantic one-to-one validation failed because the affected AUTH/OPS cases could not derive one exact wire/call/write oracle before repair.

## Read-Only Evidence

- Review used fresh Sol xhigh with read-only repository access and approval policy `never`.
- No file was edited, staged or committed by the reviewer.
- No Architecture Gate, application test/build/lint, migration, browser, deployment or production operation ran.

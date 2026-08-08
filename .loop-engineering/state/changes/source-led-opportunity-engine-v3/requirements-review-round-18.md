# Requirements Gate — Round 18

- Reviewer: fresh independent Sol Requirements Gate reviewer
- Model: `gpt-5.6-sol`
- Effort: `xhigh`
- Wrapper session ID: `019f778e-df30-7bb0-a93a-0713873c96a1`
- Date: 2026-07-19 (Asia/Taipei)
- Reviewed range: `12c131aa50ca53268878e9f025973533ac100c49..18aef71bbcd2bd39f163c322facd04e548a94e0a`
- Architecture Gate performed: no
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=2 P2=0`

## Findings

1. **P1 — Discovery identity authority is not an executable one-to-one authorization boundary.**

   The discovery supersession stream is keyed solely by `sourceIdentityId` in `source-matrix.md` and `authority-supersession-contract.md`, but storage describes `source_identity_id` as an optional display FK. No alternate non-null stream identity exists in `source_identity_authority_input_v3`. Multiple null identities would therefore collapse into one stream, and their manifest ordering/membership is undefined.

   A source revision also stores independent `source_identity_authority_id` and `approved_source_identity_id` FKs, but no RPC, constraint or deferred trigger requires the referenced authority's `sourceIdentityId` and `sourceKey` to equal the revision's approved identity and key. An active authority for identity A can therefore be attached to a revision claiming identity B unless implementation invents another rule.

   `AUTH-001` covers status supersession but not null identity keys or mismatched authority/revision identities. This leaves a central source-admission and security decision to implementation.

   **Required repair:** make the discovery stream identity non-null and executable; remove or validate every independently supplied revision identity/key; require the append RPC and database constraints to copy or prove the exact authority/identity/key equality; add null/mismatch/concurrency acceptance oracles.

2. **P1 — The blinded failure contract is not total at authentication/nonce boundaries and permits a failed-call write.**

   The four blinded routes can fail on unknown key, invalid signature, stale timestamp, nonce replay, inactive key or role mismatch, but these pre-RPC failures have no complete precedence, HTTP mapping or canonical two-key response contract. The closed `link_audit_failure_code_v3` enum does not represent those authentication outcomes, and the canonical mapping covers route-shape validation and caught link-RPC failures only.

   The contract also explicitly allows a nonce insert before a later link-RPC failure. That contradicts the Gate's explicit zero-write failed-call invariant. `OPS-021` and `OPS-024` cover only no label/audit write and omit authentication/nonce collisions.

   **Required repair:** close every pre-RPC authentication failure under one non-enumerating wire oracle and make nonce reservation transactional with the blinded operation, or otherwise prove that every failed call performs zero durable write.

## Independently Confirmed Closed

- Financial facts persist an independent provider `sourceTimestamp`, enforce `filingPublishedAt <= sourceTimestamp <= collectedAt <= recordedAt`, and bind it into both financial manifest families.
- The PostgreSQL catalog has 31 unique exact function signatures: 18 non-orchestration and 13 orchestration functions. Named enums/composites, stage/output/count branches, non-overload rules and return columns are present. `reap_opportunity_jobs_v3` accepts no caller time and captures one database clock.
- The latest-event-first algorithm includes inactive rows before status/expiry filtering, binds terminal revocation rows, applies sentinels after collapse and forbids revival of older active rows. Finding 1 prevents complete discovery-identity closure but does not reopen the supersession algorithm itself.
- For successfully authenticated blinded calls, the eight assignment dispositions, state precedence, SQLSTATE/HTTP mapping, canonical `code/error` body and no label/RPC-audit write are closed. Finding 2 concerns the preceding authentication/nonce boundary.
- Manifest dependencies are acyclic. Header/page/root lifecycle operations terminalize atomically with their owning jobs.
- Discovery remains source-led and bounded: 11 adapters, 1,000 documents per connector, 60 candidates, 30 shallow, 20 deep and 12 visible decisions. Full-roster work remains context or non-promoting audit.
- Same-run V3 detail remains immutable and isolated from legacy refresh/write paths; model influence is zero and rollout remains shadow-only.

## Inventory Validation

- Version: `1.17.0`
- Declared / actual / unique cases: `183 / 183 / 183`
- Unique exact five-field records: `183`
- Exact ordered fields `id,requirement,layer,setup,expected`: `183`
- Records with five nonempty strings: `183`
- Duplicate, malformed, empty, missing-field, extra-field or non-string records: `0`
- Skip/todo registrations: `0`; the sole textual occurrence is `GOV-001` prohibiting them
- Active mirrors are structurally consistent.
- Semantic one-to-one acceptance does not pass because Findings 1–2 lack executable oracles.

## Governance

Reviewed `HEAD` was exactly `18aef71bbcd2bd39f163c322facd04e548a94e0a`; the 13-commit review range and worktree were clean before and after review. This was strictly a read-only Requirements Gate. No Architecture Gate, edit, staging, application/repository execution, test, migration, browsing, deployment or production operation occurred.

Implementation, migration application, production bindings, scheduler enablement, model influence, merge, push, deployment and production mutation remain unauthorized.

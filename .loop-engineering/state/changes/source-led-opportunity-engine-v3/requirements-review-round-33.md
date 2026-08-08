# Requirements Gate Round 33

## Formal verdict

**CHANGES_REQUIRED**

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 1 |
| P2 | 0 |

The project permits zero blocker/high findings under `.loop-engineering/policy.yaml`. Architecture Gate remains locked.

## Immutable review evidence

- Reviewer session: `019f7a2e-6390-7062-8d53-b82850b65a09`
- Baseline: `12c131aa50ca53268878e9f025973533ac100c49`
- Review commit: `548141b7f5ed379ae93b0227f13bbe76bc68aedc`
- Direct parent: `600031b3e9bbe3fee54c5632450ef64549b4bd9c`
- HEAD tree: `69a90cf7cc80b367f5ce4e44735361df8584ba6e`
- Change subtree: `1f3aaa3d3080dcd6b9dc21982f7606bb6eaa04ff`, 73 blobs
- Baseline is the exact ancestor after 40 single-parent commits; zero merges.
- Baseline-to-HEAD contains 74 additions and zero escaped paths. Parent-to-HEAD modifies only both acceptance inventories, `decision-log.md`, `gate-summary.md`, `status.json` and `tasks.md`.
- The active normative catalog mechanically resolves to 32 artifacts.

The fresh reviewer used read-only immutable Git object reads with no network or writes. It read Round 32 only to verify closure and did not rely on earlier review reports.

## Prior-round closure

Round 32's sole mover-version finding is closed. `MKT-012`, `MKT-014` and `MKT-015` now bind `mover-audit-price-v3.3` and, where applicable, `opportunity-mover-audit-v3.3` in exact JSON/Markdown parity. Those literals agree with the manifest owner, market owner, runtime static tuple and deterministic audit UUID preimage. Parent/HEAD comparison found only the three intended canonical field changes and their mirrors; active artifacts contain no stale v3.2 mover root or audit identity.

## P1 finding

### P1-1 — The mandatory security-invoker worker read cannot access registries required to construct manifest pages

The job protocol requires each worker to obtain native manifest rows through the sole filtered `opportunity_worker_read_units_v3` view and permits no alternate read. Its manifest-page branch must enumerate `source_revision_family_registry_v3` and `opportunity_authority_stream_registry_v3`, which are the sole source-family and seven-authority stream-key enumeration authorities.

The storage contract simultaneously makes that view `security_invoker`, withholds direct `service_role` SELECT from both registry tables, and grants the worker only the view. PostgreSQL therefore checks the underlying table ACLs as `service_role`; `BYPASSRLS` does not supply missing table-level SELECT privilege. The read fails before it can construct `source_eligible` or authority-manifest pages, so no run can seal.

Canonical case `MIG-004` requires both no direct registry SELECT and working bounded worker projections. This is a constructibility conflict, not editorial drift. The repair must retain the no-direct-read boundary while giving the single job-bound view an executable owner-mediated read path.

## Independent mechanical checks

| Check | Recomputed result |
|---|---|
| Acceptance inventory | `1.30.0`; 227 declared/actual/unique cases |
| Markdown mirror | 227 unique rows; zero JSON/Markdown mismatches |
| Active contract-version edges | 29 explicit edges; zero owner mismatches |
| Runtime static identity | 36 unique ASCII-sorted current members |
| Manifest catalog | 19 unique kinds matching the PostgreSQL enum |
| RPC catalog | 31 unique granted functions matching signatures in set and order |
| Route catalogs | 6 control, 1 worker, 7 runner-ingestion and 11 human-authority routes |
| Provider preimage | 18 rows; 1,645 bytes; `fe78e0f8c5b0846f822f72c6b2356cac35ed5c00dd0bcd06f9a75b7c5b21d3f7` |
| Price/action preimage | 2 exchange rows; 313 bytes; `48fa54ee9f0e3a0b888ac0dc17eda8ad5bb746106a6fe4395eb50a5865e4e44e` |
| Mover roots | All active roots/audit IDs use v3.3 |

Apart from P1-1, the reviewer found point-in-time authority, registry/history bounds, source-only promotion, corporate-action reconstruction, durable job effects, evaluation locks, RLS/ownership, API serialization and canonical acceptance mutually consistent. No additional P0, P1 or P2 finding was identified.

## Formal verdict

**CHANGES_REQUIRED**

The zero-P0/P1 threshold is not met. Architecture Gate and implementation remain unauthorized.

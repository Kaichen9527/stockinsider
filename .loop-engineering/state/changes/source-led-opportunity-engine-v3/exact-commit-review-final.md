# V3.20 exact repair diff review — KOL retention owner boundary

Date: 2026-08-30

Review authority: independent, read-only review of the bounded V3.20 KOL
retention ownership repair. It records no production database, runtime,
scheduler, Vercel, source, LINE, dispatch, automatic-trading, Promotion, or
evaluation-governance change.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `c00f4b321a45aef3650f8752e7820306628e51f3` / `cf523950610d7a4e8c9980c57ad8183a84eaaed1`
- Focused repair range: `7d40710da509a08f9fff737b9f0df3ccc253645b..c00f4b321a45aef3650f8752e7820306628e51f3`
- Full final range: `7f461e74dc7d786a455106e20551df13d2c9131f..c00f4b321a45aef3650f8752e7820306628e51f3`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The observed production failure was reproducible: the legacy-owned KOL
  retention helper directly selected `source_document_revisions_v3`, which is
  deliberately owned by the opportunity RPC plane. PostgreSQL therefore
  rejected candidate-funnel claim preparation before a job-specific terminal
  diagnostic could be written.
- The repair keeps the two tables in their existing authority plane. A private,
  `SECURITY DEFINER` source helper owned by `opportunity_v3_rpc_owner` exposes
  only authorized InvestAnchors revision IDs to the legacy helper; the legacy
  helper remains owned by `legacy_correctness_rpc_owner` and retains access only
  to its legacy ledger. No cross-owner table grant, public execute permission,
  service-role execute permission, or persistent schema `CREATE` privilege is
  introduced.
- The local migration contract applies the full chain twice and executes the
  repaired reader after `SET ROLE legacy_correctness_rpc_owner`. This confirms
  the original permission path is closed, while a service role cannot call the
  source bridge.
- `git diff --check`, the complete migration contract (78/78), the complete
  product-correctness suite (150/150; log SHA-256
  `230dfe63f71f3f4ed78da7eb2ae9bf3d8bc7dcacc08c906805a57dfdc89c9d2d`),
  typecheck, lint and the production build passed on this exact source tree.

## Closure

No P0, P1, or P2 finding remains. The normal protected Code Gate remains the
authority for merge eligibility. This repair does not authorize fabricated
investment action, full-market nomination, credential rotation, LINE,
dispatch, automatic trading, Promotion, or a change to the blocked,
non-fabricated evaluation-governance state.

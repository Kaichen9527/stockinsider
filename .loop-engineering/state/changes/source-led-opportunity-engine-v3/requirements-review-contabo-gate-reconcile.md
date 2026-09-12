# Fresh Requirements Review — Contabo private data plane and v3.17 reconciliation

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

- Final reviewed implementation commit/tree: `b5dbac60f3de302d3883ada5dd62a5b51b264e34` / `7eb28c7326de509ad7e7e4913539a75b2b868f55`

- Full reviewed range: `c17b0e00eb32892a2b557189cdf525ef8a23a388..b5dbac60f3de302d3883ada5dd62a5b51b264e34`

- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Reviewed requirements

The subject provides the portable StockInsider data plane required before the
Supabase writer can be retired: a dedicated PostgreSQL database, loopback-only
PostgREST compatibility boundary, immutable private document storage,
identity-bound provider credential encryption, portable restore rehearsal and
standalone web service wiring. Installation remains separate from activation.

The subject also reconciles the v3.17 acceptance inventory to the already
reviewed signed-host fixture. It corrects the exact MR3-019 byte count,
script-value digest and two catalog authority tags, then removes the temporary
bootstrap comparison branches. No range, wildcard or fallback identity is
accepted.

## Requirement closure

- The application accepts Contabo only at fixed loopback endpoint
  `127.0.0.1:3302`, with a complete release identity, backend/principal IDs and
  service credential supplied through systemd credentials.
- Raw PostgREST remains loopback-only on port 3301. The dedicated Nginx listener
  accepts only `/rest/v1/`, strips that prefix and rejects every other path.
- PostgreSQL bootstrap recreates required role names while the additive
  migration preserves RLS, RPC and writer-fence semantics.
- Provider tokens use AES-256-GCM envelopes bound to provider, owner,
  generation and key version. Refresh is compare-and-swap protected and cannot
  revive a revoked generation.
- Private artifacts are content-addressed, immutable, non-public and reject
  traversal, symlink and overwrite attempts. Financial-document and source
  audit writers both use this boundary.
- Restore rehearsal streams the encrypted archive without persisting plaintext
  and validates roles, schema, RLS, functions and application access before an
  activation receipt can pass.
- Local backup orchestration requires database, documents, credentials,
  offline-readability and application-restore evidence; an interrupted export
  is not a complete backup.
- Installation does not activate the Contabo production writer. Final
  synchronization, credential transfer, source/research canary and the
  seven-day read-only Supabase observation remain deployment operations.

## Verification evidence

The reviewed commit passed 151/151 source-led product-correctness tests, 25/25
Contabo data-plane tests, 46/46 capacity/backup tests, 15/15 protected external
worker tests and the HYB-007/GOV-004/GOV-001 structural checks. The corrected
active graph was recomputed from tracked bytes as
`c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`.

## Release boundary

This PASS establishes requirements completeness only for the exact reviewed
subject. It does not claim migration execution, production activation, PR
merge, deployment, canary, Supabase retirement or subscription cancellation.

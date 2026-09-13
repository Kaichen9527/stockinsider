# Exact implementation review — financial backlog and local backup completion

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `e73089ce6b4078c1fb1e3df3ac7818adc6071b87` / `d0d94f96dc475e64daee8d4c8a32bdac674a0a20`
- Full final range: `25bb1d2cf8a47560791941d9833e3d709d2b0705..e73089ce6b4078c1fb1e3df3ac7818adc6071b87`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- The candidate-financial drain now reads the complete bounded due-job set in deterministic 1,000-row pages before choosing issuers. A fixed 160-row lookahead can no longer repeatedly select receipt-blocked issuers and starve later companies.
- The scan remains bounded at 10,000 due rows, fails closed when that operational bound is exceeded, excludes document-only work, and leaves the existing lease-bound claim RPC as the sole authority that changes queue state.
- Local storage restore rehearsal now reads only the exact manifest filenames named by the current immutable inventory. It no longer traverses unrelated historical or cloud-placeholder manifests in the backup directory.
- Inventory member names and uniqueness are validated before any restore. Existing content-hash, GCM envelope, private-path, size, and plaintext hash checks remain unchanged.

## Security and correctness reasoning

- Pagination is read-only and deterministic; it neither bypasses the service-role writer identity nor widens the maximum number of jobs claimed per drain.
- Claiming, retry scheduling, completion, and failure terminalization remain protected by the existing database leases and RPC grants.
- The backup change narrows filesystem authority from every matching historical manifest to eight inventory-bound members. An unrelated malformed manifest is covered by regression testing and is ignored.
- The change does not alter classification thresholds, public source policy, data retention, database privileges, token storage, or destructive cleanup behavior.
- No volume, database, running container, or unrelated application state is deleted by this change.

## Verification

- Targeted candidate-financial and storage restore regression tests: 10 passed, 0 failed.
- `npm run test:contabo-capacity-backup`: 61 passed, 0 failed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 154 passed, 0 failed.
- TypeScript passed; ESLint completed with 0 errors and 33 pre-existing warnings.
- Next.js production build passed and generated 89 routes.
- `git diff --check 25bb1d2cf8a47560791941d9833e3d709d2b0705..e73089ce6b4078c1fb1e3df3ac7818adc6071b87` passed.

This review covers the exact implementation commit. Deployment, provider acquisition, final research publication, and the seven-day Supabase observation remain separately measured rollout gates.

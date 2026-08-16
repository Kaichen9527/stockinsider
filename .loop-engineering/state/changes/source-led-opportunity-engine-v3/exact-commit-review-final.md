# V3.16.18 exact analysis-payload reuse review

Date: 2026-08-17
Reviewer: Sol exact-range runtime/data-integrity review
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Reviewed base: `9c21b2c8f1d3429e6fe7ac2c6cfe5a1d5b8f83de`
- Final reviewed repair/tree: `950e4f5433e4fd9a42697cca6a5f66a223f473b9` / `39a1eed66d3d6c2a3b9ac4d6bdbf6cd3118ed352`
- Full final range: `9c21b2c8f1d3429e6fe7ac2c6cfe5a1d5b8f83de..950e4f5433e4fd9a42697cca6a5f66a223f473b9`
- Active graph: `71abf84b4ae6b4703fd0559807fba15553c1f5a68c56e19039aae44173727b9d`
- Changed migration: `migrations/20260817_analysis_payload_exact_reuse_v3_16_18.sql`
- Changed migration allowlist/postcondition: `scripts/opportunity-v3/apply-reviewed-migrations.mjs`
- Changed regression: `scripts/opportunity-v3/migration-contract.test.mjs`

## Production failure and closure

Production run `88356103-fd10-255e-13f8-51b617150402` completed source,
claim, candidate, and official-fact stages, then failed closed at
`analysis_revision` with `analysis_revision_payload_conflict`. The installer
restored the previous runtime pointer; Web was not deployed.

The V3.11 claim intentionally excludes same-cutoff revisions. The inner V3.13
wrapper then used an inner join that silently removed legacy revisions without
immutable payloads. A retry therefore reached the worker without the reusable
same-material facts and attempted to persist different collection metadata
under an existing immutable `symbol + materialChangeHash` identity.

The successor migration resolves prior facts from each current decision:

- an exact material hash is selected only at or before the run cutoff;
- otherwise the newest earlier payload-backed revision is selected;
- payload-less legacy metadata is skipped instead of treated as replayable facts;
- the read canonical bytes/hash and 3 MiB bound are recomputed;
- the reviewed predecessor, owner, grants, and service-role boundary remain intact.

The current production-shaped fact set contains 20 decisions with 20 exact
payload-backed identities and five older payload-less legacy rows. The new
selection closes both cases without using future data or weakening immutability.

## Exact review

- Functional correctness: PASS. Same-cutoff retries receive the exact prior
  payload; changed material falls back only to an earlier payload-backed lineage.
- Point-in-time integrity: PASS. No revision after `sourceCutoff` is eligible;
  an exact same-cutoff retry is eligible, while future observations are excluded.
- SQL safety: PASS. The migration is additive and transactional, contains no
  destructive DDL, and applies twice in a clean V3.13-through-V3.16.18 rehearsal.
- Authorization: PASS. The helper is private to the correctness RPC owner; only
  the public claim wrapper remains executable by `service_role`.
- Compatibility: PASS. Legacy rows without disclosure payloads are not replayed,
  and the existing immutable completion constraint remains unchanged.
- Scope and artifacts: CLEAN. The exact implementation changes three tracked
  text files and includes no generated, credential, or environment artifact.
- Findings: `P0=0 P1=0 P2=0`; no repair range was required.

## Verification evidence

- Full product/runtime diagnostic: PASS, including typecheck, lint, production
  build, core 61/61, product correctness 109/109, migration 58/58, V1/V2 2/2,
  Playwright 8/8, and performance 5/5.
- Model runner: 18/18 PASS; doctor PASS with deployment disabled and host pin v3.9.
- Production-shaped read-only identity audit: 20/20 exact reusable payloads;
  five payload-less legacy rows correctly classified as non-replayable.
- `git diff --check`: PASS.

The established Requirements and Architecture contracts are unchanged by this
bounded repair. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` until the real 120-date,
20-live-date, and 252-attempt cohorts mature; this Code Gate does not claim that
future returns have been proven.

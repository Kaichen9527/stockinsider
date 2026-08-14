# V3.15 immutable-analysis exact-commit review

Date: 2026-08-14
Reviewer: Codex Sol independent exact-range review
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subjects

- Reviewed base: `8cccb21f0b6cced023543118a606e63adf225c9d`
- Payload-bound implementation commit/tree: `acadd4e5531cd390257403b7186d16af6f87420d` / `304862ae0b7a005cdeafff3f56fb3c7d68523463`
- Requirements evidence carrier: `9e3b541ce4ae3982dee1d64f17ee665686513a45`
- Architecture/source commit/tree: `e2495ee8f30f5ab304ccb63fec6b6d8bf6b0f0c1` / `18885aa2bc7895f98a0efaf541dac8c516f37ce6`
- Final reviewed repair/tree: `e2495ee8f30f5ab304ccb63fec6b6d8bf6b0f0c1` / `18885aa2bc7895f98a0efaf541dac8c516f37ce6`
- Full final range: `8cccb21f0b6cced023543118a606e63adf225c9d..e2495ee8f30f5ab304ccb63fec6b6d8bf6b0f0c1`
- Exact repair range: `acadd4e5531cd390257403b7186d16af6f87420d..e2495ee8f30f5ab304ccb63fec6b6d8bf6b0f0c1`
- Active graph: `734b013bdfd750bfdf87ceb731f9db5033d9d4c8614323e1a884d8b43cb7c717`
- PCR fulfillment: `pcr-fulfillment-record-v1.json`

## Diff review

1. The first reviewed analysis run crossed the 3 MiB transport repair but one
   immutable decision payload remained 405,340 bytes against the independent
   262,144-byte persistence guard. The same ordered evidence facts appeared as both
   `evidence` and provenance-enriched `sourceEvidence`.
2. `immutableAnalysisFacts` removes the older representation only when each ordered
   `sourceEvidence` row contains every original key and every non-provenance value is
   canonical-byte equivalent. Any changed claim, excerpt, valuation, technical fact
   or other semantic value retains both representations and fails closed at the
   existing database bound.
3. The captured production shape retains `sourceEvidence` byte-for-byte, reduces the
   largest revision to 206,591 bytes and the complete analysis result to 1,546,468
   bytes. All 20 decisions and 40 source candidates remain present.
4. Projection decisions are derived from the same compact fact object before their
   persistence-only `analysisRevision.facts` leaf is removed. Action, valuation,
   revision metadata, citations and DecisionEnvelope authority remain unchanged.
5. The protected base owns the model-runner authentication repair; the product range
   contains no model-runner byte changes. Existing owner, mode, no-symlink and size
   checks remain in force; real permission probes pass with `HOME=/tmp`.
6. Fresh Requirements Round 164 and Architecture Round 45 pass with P0/P1/P2 zero.
   Core contract tests pass 61/61; product correctness 100/100; migration 53/53;
   legacy 2/2; Playwright 8/8; performance 4/4; model-runner 18/18. Typecheck,
   lint, production build, disabled host-pin v3.8 doctor and `git diff --check` pass.
7. The repair and full-range reviews found no SQL/data-safety, concurrency, trust
   boundary, shell, enum, frontend or distribution finding. Requirements and
   Architecture carriers are unique direct children of their reviewed subjects.
   This exact-review child adds only the closed three-file attestation set.

## Authority boundary

This PASS authorizes the already-approved coordinated tracked producer and Web
release. LINE, dispatch, automatic trading and V3 Promotion remain disabled.
Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` pending real elapsed cohorts;
no future-return claim or daily buy quota is created.

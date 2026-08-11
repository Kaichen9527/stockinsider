# Fresh Requirements Gate Review — Round 107

Subject commit: `8ede8ba49aaed6cce92e1f4be11e7343ac12ab90`
Subject tree: `ecc6f017db6668fb86531d77c8a0a306da33df72`
Baseline commit: `1b714a4303c2a97ebb913dced8d9d607a4ac8951`
Baseline tree: `463cdf53127a38553ecba80f31ad8cddb28ff6f1`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=3`, `P2=0`)

## P1 findings

1. The V3.13 migration revoked `service_role` execution on
   `complete_legacy_producer_job_v3_11` and restored it only to
   `legacy_correctness_rpc_owner`. The tracked producer calls this RPC as
   `service_role`, so an applied migration would prevent terminal job completion.
2. The immutable decision serializer recursively removed all `publishedAt` and
   `evaluatedAt` leaves. This deleted required publication provenance and the
   immutable analysis evaluation date from the exact Decision Brief even though
   publication provenance participates in the revision identity.
3. A no-change revision retained the original row's `source_led_correctness` because
   persistence used `ON CONFLICT DO NOTHING`. Exact detail then aged against the
   first heartbeat while Landing used the current heartbeat, eventually making a
   current Landing link unavailable. Immutable decision content and append-only
   evaluation heartbeat storage must be separate.

## Prior finding disposition

All five Round 106 classes are closed in their original form: immutable decision
content is heartbeat-free, exact lookup no longer scans the newest projection,
valuation history bounds revisions before selecting 252 distinct sessions, V3.13
relations have the required RLS boundary, and financial facts cross the typed bounded
append authority. Findings 2 and 3 above are new consequences of the heartbeat repair.

## Evidence and gate disposition

The active graph reconstructed to 49 artifacts and 39 owners. Catalog SHA-256 was
`1aea3bc6949f964c75b8579373fd39f7fb077985418e3a8ca173465f6da5ad08`; active-graph
SHA-256 was `835349c0bde0519fc531ddb3702a98dc9991874516b1134251b37097963f5ad4`.
The canonical acceptance inventory remained version `1.45.0` with 308 IDs (260
product/runtime, 28 model-runner and 20 evaluation-governance).

Typecheck, lint and the four active-graph structural cases passed. PostgreSQL,
Playwright and temporary-file diagnostics that attempted writes from the independent
read-only sandbox were blocked by `EPERM`; those environmental limitations were not
classified as product findings. The subject worktree and index remained clean, and no
production or external write occurred.

Requirements Gate is `FAIL / CHANGES_REQUIRED`. Architecture remains blocked until
the three P1 roots are repaired in a new immutable tree and another independent fresh
Requirements review returns `P0=0` and `P1=0`.

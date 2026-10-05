# StockInsider execution status — October 5

This ledger separates implementation, tests, independent code review, protected
approval and live acceptance. The user's cross-chat and implementation/release
authorization remains in effect; the remaining release barriers are technical
requirements, not a request for renewed permission.

## Implemented and independently reviewed

- Financial history admission no longer applies a lifetime 128-row bound.
  Period revision bounds, immutable observations, point-in-time reads and atomic
  deployment are retained. Financial review is recorded in its exact-source receipt.
- Bounded public acquisition and authorized Mac-summary import preserve read
  failures, publication clocks, roots, corrections and withdrawals. Source scope
  approval is bound to 75d0752. Actual Mac reads include AUO detail/index, issuer
  data and publisher RSS; they do not establish transcript or social-platform
  content coverage. Failed Cloud egress and the later TWSE timeout remain visible.
- Schema repair at 56b244a passed 133 research tests and 86 migration/helper tests,
  lint and the normal Mac build. Independent code review passed. A disposable
  local cluster restored actual schema owners/ACLs and executed 54 of 55 planned
  files, preserving the stronger predecessor. Required runtime-role attributes
  were simulated. This is not a production migration or privileged operator proof.

Draft PRs #290, #291 and #292 isolate history, source and schema changes on top of
the existing #289/#287/#284 stack. None is merged into main. The exact reviewed
code commits and subsequent documentation commits are intentionally distinguished.

## In progress

Cloud discovery enrichment at 8613458 passed 43 existing tests, but independent
review requested changes for three real defects: a full historical calendar hits
the read cap forever, the existing TPEx collector URL is rejected, and weak old
first-discovery quotes can be promoted to verified official data. The authorized
Cloud chat has been assigned fixes and regression tests. This branch is not yet
integrated or approved. Ranking remains unchanged and incomplete relative-return
and price-phase adapters remain null/unknown.

The fixed 32-read admission is not fair resume. Initial missing evidence remains
an immutable first-discovery gap; later supplementary research must use separate
receipts and must not backdate knowledge. That supplementation is still open.

## Live release barriers confirmed again

- #288 protected requirements, architecture, exact-review and root checks fail;
  ordinary diagnostic CI succeeds. #292 has the same separation. Authentic
  owner-controlled recovery and exact-version signed evidence remain missing.
- Production runtime is NOLOGIN with connection limit -1, unlike the reviewed
  LOGIN/NOINHERIT/limit-6 contract. The preflight now refuses before mutation.
  No credential, role or main protection was modified.
- VPS free disk was 13,023,440,896 bytes on the latest read-only check, below the
  existing approximately 20.40 GB heavy-work floor. No expansion was observed.
  Web standalone, internal worker, PostgREST, preview, parser, PostgreSQL and
  Nginx are running; capacity watch and historical backfill are failed.
- Previously approved obsolete files are already absent. Active deployments,
  database, research/history and other applications are preserved. No additional
  unused release was proven safe to delete in this check.

## Still required for the original product goal

1. Real content-reading acceptance for each source platform and search expansion;
   RSS/index metadata must not count as content analysis.
2. Actual six-role model queue consumer, shared budget, retry/restart/offline
   recovery and 30-day renewal, rather than only validated interfaces.
3. AUO and another industry company completing evidence, forecasts, original
   article, independent review, thesis qualification and publication. AUO remains
   marked as a demonstration research direction.
4. Actual adjusted/PIT benchmark, institutional and corporate-action inputs;
   monitoring qualified companies and every existing paper position.
5. Full-candidate historical/forward experiments, independent result consumer,
   precise user-approved strategy versions and durable paper execution. Existing
   small samples are not evidence of profitable selection or stable returns.
6. Real VPS lease → Cloud work → independent review → authenticated VPS receipt
   roundtrip, including interrupted recovery and budget/capacity admission.
7. Authentic protected recovery, runtime bootstrap, capacity admission, ordered
   merge commits, reviewed migration and live desktop/mobile verification.
8. Schedule activation after release acceptance and five actual trading days of
   observation. Five days demonstrate operation, not profitability.

Cloud remains the bounded research/test worker; VPS remains the durable production
system; Mac retains authorized social reading and transitional trusted operations.
No automatic strategy adoption or live orders are introduced.

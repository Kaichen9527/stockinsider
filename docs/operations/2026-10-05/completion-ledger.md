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

## Further implemented and independently reviewed

The deterministic tester controller now obtains the real server reservation,
freezes the original packet and submits returned artifacts to the existing
authenticated receiver. Ambiguous responses are journaled without automatic
reclaims; verified packets survive final destination-write failure. Independent
review at 72e54dc passed 24 cases and stalled-body/recovery probes. This is one
tester bridge, not six active model roles or an actual VPS/Cloud roundtrip.
The subsequent transport review reproduced a GC-sensitive stalled-body timeout
in both controllers. An explicit deadline race now covers fetch and body reads;
monitor dispatch also rechecks the deadline after durable journaling. Review at
3aa8710 approved these repairs, 13 monitor cases and three real-HTTP deadline
probes. Independent approvals remain bound to their exact code commits; none is
protected release approval.

Cloud discovery enrichment at 8613458 passed 43 existing tests, but independent
review requested changes for three real defects: a full historical calendar hits
the read cap forever, the existing TPEx collector URL is rejected, and weak old
first-discovery quotes can be promoted to verified official data. The authorized
Cloud chat fixed them at 23dffca; independent review passed 49 cases with zero
skips and additional 600-row/cutoff/market probes. The reviewed branch has been
integrated; 169 root research/integration tests passed with zero skips, lint had
zero errors (33 pre-existing warnings), and the normal Mac build passed. Ranking remains unchanged and incomplete
relative-return and price-phase adapters remain null/unknown. The exact review
record is saved separately from protected and live acceptance.

Later supplementary observations are now separate from the original immutable
first-discovery quote. Review at 9cce051 passed 61 tests and three independent
probes. The server prioritizes its Top 20 and active research, shares 32 reads
between historical/current observations and preserves every gap. Invocation clocks
bind the new run hash; late observations cannot overwrite earlier knowledge.
Fair resume, adjusted benchmark, relative returns and price phase remain open.

A bounded monitor now consumes the real worklist contract, processes all held
symbols first and saves server-generated technical snapshots. It accounts for
every skipped/deferred company, journals ambiguous responses and does not renew
theses or pretend to process paper-position risk. Independent review at 3aa8710
passed. This is a tested consumer, not an accepted live monitoring deployment.

The integrated code at 3aa8710 passed 206 research/integration tests with zero
failures or skips, and the normal Mac production build passed.
Draft #296 retains these additions on the existing stack; main is unchanged.

Public AUO research on October 5 read five article/document bodies and recorded
two failed reads. Intel patent commentary is not confirmed AUO orders, and same-root
reports are not independent confirmation. The original application is dated
March 2024. The receipt preserves unknown publication timezones, unavailable raw
body hashes and a media EPS/P/E inconsistency instead of admitting them as financial
facts. IG, Facebook, PTT and transcripts were not attempted in this focused pass.
These manual observations have not been imported or published as a new article.

## Live release barriers confirmed again

- #288 protected requirements, architecture, exact-review and root checks fail;
  ordinary diagnostic CI succeeds. #292 has the same separation. Authentic
  owner-controlled recovery and exact-version signed evidence remain missing.
  Draft #295 now provides the independently reviewed inactive installer proposal
  (73e0aed, 46 tests). It enumerates 24 required external deployment fields and
  eight evidence obligations. Its validator does not install, reserve or activate;
  actual authority, CAS and installation/publication adapters remain external gaps.
  Latest #296 protected run 37266338330 still cannot fetch the required exact-head
  review and v318 requirements/architecture evidence branches. Its ordinary product
  runtime check passed; this does not substitute for the failed protected checks.
- Production runtime is NOLOGIN with connection limit -1, unlike the reviewed
  LOGIN/NOINHERIT/limit-6 contract. The preflight now refuses before mutation.
  No credential, role or main protection was modified.
- VPS free disk was 13,011,673,088 bytes on the latest read-only check, below the
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

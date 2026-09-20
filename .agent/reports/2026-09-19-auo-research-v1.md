# AUO-first research and valuation implementation

Date: 2026-09-19

Branch: `codex/auo-research-v1`

Base: `3852578bd0b0dcbd564836792926a46d757423cf`

## Outcome

The candidate research path now treats AUO (`2409`) as an explicit, versioned
`cyclical_asset` profile. Its primary publishable target method is a forward
common-equity/BVPS bridge multiplied by the official historical P/B distribution.
The route cannot leak to other panel or electronics issuers merely because they
share a sector label.

The public stock detail now opens with the decision and valuation. It reports
coverage only for the financial field-periods required by this method. Market-wide
publication completeness and fact row counts no longer appear as issuer research
completeness. Raw official facts, citations and local research controls remain
available in collapsed appendices.

This change does not claim that AUO's historical financial coverage is complete.
It adds the official source paths, acquisition jobs and fail-closed valuation
contract needed to complete that coverage without promoting the existing
unvalidated mirror rows.

## Source path

- Added TWSE OpenAPI income and balance-sheet acquisition for listed issuers.
  The parser distinguishes equity attributable to owners of the parent from total
  equity. It does not map total liabilities to interest-bearing debt.
- Added period-pinned AUO investor-relations statement and handout URLs for
  2024 Q3 through 2026 Q2, plus an issuer-scoped `www.auo.com` domain migration.
- The latest TWSE balance response can supply common equity and BVPS. Ending
  common shares may be derived only when those two admitted facts share the same
  period. Weighted-average EPS shares remain a separate fact.
- Historical AUO PDFs remain fail-closed until the existing document worker records
  a validated extraction manifest, page/table locator and immutable document hash.
  Downloading a PDF or recognizing a filename does not create a financial fact.

## Valuation and presentation

- The AUO method requires eight reported quarters of revenue, gross profit,
  operating income and common income, plus latest-period common equity and ending
  common shares, plus reported revenue and operating income for Display,
  Mobility Solutions and Vertical Solutions in the latest bridge quarter. Its
  method-specific denominator is 40 explicit field-periods (34 consolidated and
  6 segment field-periods); diluted EPS and weighted-average EPS shares are not
  P/B inputs. The formal candidate path remains incomplete if those segment
  rows have not entered through an official point-in-time event.
- The forward equity bridge is `starting common equity + projected common income
  - projected dividends + projected capital/OCI`. Future dividends and capital/OCI
  are currently explicit zero model assumptions, not reported facts.
- At least 48 distinct monthly official P/B observations are required. Each one
  must reconcile to the BVPS that was public on that date, retaining the market
  source and BVPS source. Bear, base and bull targets use the 25th, 50th and 75th
  percentile P/B respectively. If the equity bridge or P/B history is incomplete,
  no target is published.
- The read-only preview now uses `starting common equity + the next four forecast
  quarters of common income` divided by ending common shares. P/E is shown as a
  cross-check and no longer enters the primary P/B target through a manual blend.
- Candidate revisions now include actual daily sessions with MA5/20/60/120/240.
  Missing trading sessions are not interpolated. Existing monthly evidence remains
  separate.
- The detail page labels the target period and method in plain language and moves
  raw evidence/source listings below the decision, valuation and historical charts.

## Research resume behavior

The hourly Taiwan queue drain now performs a guarded research resume after queue
and document work. It returns without running when the final Taiwan scope is not
research-ready, and it returns when the same technical session already has a
successful or partial receipt for the current research model version. The shared
systemd `flock` and production write lease continue to serialize the actual run.
This contract is covered locally, but the real 2409 acquisition-to-publication
path has not been executed on production in this change.

The symbol-scoped canary resolves 2409 directly from the cutoff-bound official
stock master, so it does not depend on a recent social mention or global seed. It
also leaves the globally claimed document-receipt queue to the serialized document
worker; a one-stock canary cannot lease or write another issuer's receipt.

## Capacity and cost decision

Only disposable Docker builder cache was reclaimed during the investigation; no
images, containers or volumes were broadly pruned. Available space rose from about
9 GiB to about 15 GiB, still below the approved 19 GiB admission target (15 GiB
reserve plus 4 GiB working space). Production migration/backfill/deploy therefore
remains blocked by capacity.

Contabo documents two low-risk account-panel options:

1. Extend the current Cloud VPS SSD storage. Contabo's published example is an
   additional 200 GB for EUR 2.45/month; the actual amount and price depend on the
   current plan and are shown before confirmation.
2. Upgrade an NVMe Cloud VPS to a larger plan using live migration when the current
   and target configurations permit it. The upgrade itself has no separate fee;
   Contabo charges the prorated plan-price difference for the prepaid period.

A separate Storage VPS starts around EUR 4.40-5.50/month for 300 GB depending on
region/term, but it adds another host and does not directly enlarge Docker's local
build filesystem. The preferred next action is the current VPS's `Extend SSD
Storage` option if the control panel offers it; otherwise select a same-storage-type
live upgrade. No purchase was made.

Official references:

- https://help.contabo.com/en/support/solutions/articles/103000404620-can-i-add-more-ssd-storage-to-my-vps-or-vds-dedicated-server-
- https://help.contabo.com/en/support/solutions/articles/103000269700-how-to-make-changes-to-your-vps-or-vds-plan
- https://contabo.com/en-us/storage-vps/

## Verification

- Focused AUO, source-provenance and scheduling contracts: passed.
- TypeScript: passed.
- ESLint: passed with repository-existing warnings only.
- Next.js production build: passed; all 89 static pages generated.
- `git diff --check`: passed.

## Open gates

1. Validate and admit the eight historical AUO quarters from official documents;
   do not reuse the 150 legacy FinMind rows without exact validation receipts.
2. Complete a real AUO research run and verify the produced revision, valuation
   snapshot, method-specific gaps and public rendering.
3. Confirm the control-panel expansion price for the actual VPS and raise available
   capacity to at least 19 GiB before a production migration/backfill/deploy.
4. Complete exact-commit review and protected CI before merge. This report is not
   a production deployment or data-completeness attestation.

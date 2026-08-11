# V3.13 exact implementation commit review

## Immutable subject

- Parent: `75e329471da257c2855d4de04d71e05a589e6c72`
- Exact implementation commit: `3f3fb99412ceee7c3c21dda11199a30be1594242`
- Exact implementation tree: `4eacc4dad679bc85c7f46453c5e01e0ea18de9dd`
- Range: `75e329471da257c2855d4de04d71e05a589e6c72..3f3fb99412ceee7c3c21dda11199a30be1594242`
- Review mode: independent, read-only exact-commit diff review
- Verdict: `CHANGES_REQUIRED P0=0 P1=5 P2=3`

## Findings

1. `P1` — generic migration authority trusted allowlisted basenames without canonical path, regular-file, no-symlink and exact byte-digest enforcement.
2. `P1` — daily, hot and weekly Radar responses used shared caching that could retain a buy-like card after its scheduled freshness boundary.
3. `P1` — V3.13 `sourceAcquisition` and `officialIngestion` validation was conditional on the producer voluntarily presenting the extension.
4. `P1` — historical NAV, EV and share inputs used the run cutoff instead of each exchange session's knowledge cutoff, creating hindsight risk.
5. `P1` — Podcast feed/transcript acquisition lacked destination authorization, public-address validation, redirect validation and DNS pinning.
6. `P2` — operator documentation mixed legacy cookie/watchlist instructions with the tracked V3.13 worker and raw credentials.
7. `P2` — active E2E/audit consumers used revisionless deep-dive reads and retired headings.
8. `P2` — focused tests asserted source shapes but did not exercise the five actual trust boundaries.

The review granted no production authority. Requirements Round 130 and Architecture Round 16 remain historical PASS evidence for their immutable subjects; this finding set requires a repair commit plus repair-range and full-range closure review before the authoritative Code Gate.

## Required closure matrix

| Finding | Required repair evidence |
| --- | --- |
| P1-1 | Canonical directory, no symlinks, descriptor-safe retained bytes, exact SHA-256, validation before DB connection; adversarial path/swap tests. |
| P1-2 | `private, no-store` for every daily/hot/weekly result class; no ETag/304/shared stale response; all-route tests. |
| P1-3 | Mandatory exact extension on source/facts success with atomic rollback and valid 17×3/official-ingestion fixtures. |
| P1-4 | Per-session `min(close_at, source_cutoff)` knowledge cutoff for candidate/peer metric facts and shares; exact-close/post-close regression. |
| P1-5 | Approved origins, public DNS-only resolution, pinned HTTPS destination and validated redirects; private/mapped/reserved/cross-origin tests. |
| P2-1 | Versioned V3.13 non-activating runbook using keychain references and explicit legacy labeling. |
| P2-2 | Revision-bound Decision Brief E2E/audit consumers included in authoritative fixture Playwright. |
| P2-3 | Behavioral regression coverage for every P1 boundary. |

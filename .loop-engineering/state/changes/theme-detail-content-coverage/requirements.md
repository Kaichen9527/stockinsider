# Requirements: theme-detail-content-coverage

## Problem

Theme detail pages such as `/themes/quartz-frequency-components` can render with almost no content even when the homepage hot theme card has related symbols. The detail API currently depends too much on same-day formal recommendations and live theme rows, so registry-only or lead-lag themes look empty.

## Requirements

- Every homepage hot theme detail must have readable content: theme brief, tracked symbols, evidence matrix, and next refresh plan.
- Theme detail must merge live `theme_heat` with a registry fallback covering seed themes, discovery themes, global lead-lag baskets, and dynamic hot themes.
- If no formal recommendation exists, the page must clearly show candidate / hot tracking / pending verification language and never imply a buy recommendation.
- Quartz / frequency components must include all mapped symbols from radar and registry, including `3221 / 3042 / 2484 / 8183`.
- Source coverage must distinguish live evidence from registry-derived coverage and missing sources.
- `runThemeScan()` must preserve source metadata fields and write auditable evidence for discovery and lead-lag themes.
- No Supabase migration or production deploy is part of this change.

## Non-Goals

- Do not relax formal recommendation gates.
- Do not create new database tables.
- Do not deploy to Vercel production.

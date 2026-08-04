# Design: theme-detail-content-coverage

## Approach

This change uses a two-layer fallback:

1. Live layer: `theme_heat`, recent `recommendations`, `story_candidates`, `research_memos`, and `source_raw_documents`.
2. Registry layer: deterministic `ThemeContentRegistry` derived from existing research seeds, discovery taxonomies, passive-component mapping, and global lead-lag baskets.

The detail API merges both layers and returns:

- `themeBrief`
- `trackedSymbols`
- `evidenceMatrix`
- `nextRefreshPlan`
- `contentStatus`

The theme page renders these fields before recommendations so a theme remains useful even without formal picks.

## Data Safety

- Registry-derived content is always candidate / pending verification.
- No registry-derived source can support formal Base valuation.
- Source raw documents are read with explicit fields and limits.
- `runThemeScan()` writes actual row counts and no longer skips discovery themes solely because this run has zero social docs.

## Verification

New audits:

- `audit:theme-detail-coverage`
- `audit:theme-source-coverage`
- `audit:theme-symbol-consistency`

Regression audits remain required for radar availability, global lead-lag, and source health.

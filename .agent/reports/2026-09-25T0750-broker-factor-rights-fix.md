# Broker factor rights fail-closed repair

Reviewed at: 2026-09-25T07:50:36Z  
Status: code fixed, tested, not deployed

## Finding

The research-only UBS/2454 event is correctly metadata-only because no factor-use grant exists. The production mapper had a separate high-severity inconsistency: manual/import source modes could set `lawful=true` even when no explicit permission existed, and the boolean could be evaluated before an explicit `blocked` status. Three nominal sources could therefore create a full broker-evidence score despite unknown or blocked rights.

This did not alter run 36081668572: S7 was blocked and no broker feature entered any of the fifteen price-strategy trials. It is nevertheless unsafe for a later production candidate refresh.

## Repair

`brokerEvidenceRowsFromSnapshots()` now treats source mode as provenance only. Only `licenseStatus=licensed|permitted` makes a mapped snapshot lawful. `brokerIsLawful()` returns false first for explicit `blocked|unknown`, so a convenience flag cannot override it. Snapshot rebuild metadata now writes `license_status=unknown` and `authorization_basis=source_mode_is_not_factor_use_grant`.

The narrowly bounded legacy representation `freshness_status=licensed` remains usable only when there is no explicit license status. This preserves old explicitly licensed rows while keeping all current candidate mappings fail-closed because missing metadata is normalized to `unknown`.

## Validation

- Targeted Node tests: 8 passed, including the new manual-mode and negative-status regression.
- TypeScript check: passed.
- Next production build: passed; 91 static pages generated.
- Network requests, database reads/writes, holdout access, article publication and deployment: zero.

The code is on the research branch only. After review and eventual deployment, the guarded pipeline must rebuild snapshots. Existing documents do not score until an independently backed `licensed` or `permitted` status is supplied; manual upload alone is insufficient.

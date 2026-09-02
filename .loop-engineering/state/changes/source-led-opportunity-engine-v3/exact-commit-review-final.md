# Exact implementation review — source research, valuation, detail and Shadow v2

Date: 2026-09-02

Review authority: read-only exact review of the immutable implementation
subject after rebasing onto the repaired signed-host trust root.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `5c0a7c2b6951fa66747d2eee74401c59176f4f8c` / `816c0763c4bb340d06cbf69198c8230942e93bf8`
- Full final range: `509dc7492b8b4103b03661ca239d93160a872a2a..5c0a7c2b6951fa66747d2eee74401c59176f4f8c`
- Active graph: `81dceab0d17b6c0f0c104ee3376f6d1dc5065a283040a4c1ee0ac40f574580d4`

## Review result

- Source ingestion uses explicit registry dispositions and a VPS writer lease;
  inactive, blocked, retired and manual-only connectors cannot report false
  success or enter the health/Shadow SLA.
- GDELT uses the official HTTPS GKG raw feed with a durable cursor; Telegram
  remains metadata-only; PTT institutional ranking rows are evidence rather
  than discovery candidates; Podcast requires an allowlisted RSS feed.
- Research reads point-in-time official facts, persists market evidence,
  routes the 17 named valuation exceptions without invented targets, and
  treats any partial item as a non-successful research run.
- Candidate detail revisions remain readable without a legacy decision
  revision and bind claims to official fact IDs. Dossier enrichment is
  fail-closed and cannot alter deterministic classification.
- Shadow policy v2 freezes a daily manifest, measures terminal coverage rather
  than average confidence, records publication identity after atomic publish,
  and starts from a truthful live `0/30` without historical backfill.
- Public Radar remains a compact last-good snapshot; stale publication clears
  actionable authority and preserves a read-only display.
- Migrations are additive. Writer fencing, indexes, RPCs and append-only audit
  tables preserve historical rows and keep service-role boundaries explicit.
- Product/runtime, source-policy, candidate research, valuation, market,
  dossier, signal-action, migration and Shadow tests passed; lint, TypeScript
  and production build passed on the reviewed source.
- Exact-subject product correctness passed 150/150 with stdout SHA-256
  `e172cde759abd75850a564b8b98c5ac330a316d84de0561b0364315afc55b968`.

## Closure

No P0, P1 or P2 finding remains. This review authorizes normal protected-gate
evaluation of this exact subject. Production migration and deployment remain
conditional on the protected checks, controlled migration, VPS canaries and
post-deploy health verification.

# Exact implementation review — auditable candidate research funnel

Date: 2026-09-06

Review authority: read-only review of the complete immutable diff, additive
migrations, production-write boundaries, financial point-in-time semantics,
valuation and stage transitions, dossier publication, public projections, and
shadow replay behavior. The review included independent diff and security review,
SQL/data safety, source identity, lease and retry behavior, stale-action
fail-closed behavior, evidence-to-claim relevance, and deployment rollback
boundaries.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `b1f6d17f8dd93e4510db5fb2179950122596096d` / `94601ca1da7a982d2c0cc2e74c026e7dc7c11c22`
- Full final range: `cfaa4aa5c23fdb50a00d871f05c87453fa9f82b5..b1f6d17f8dd93e4510db5fb2179950122596096d`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`

## Review result

- The four migrations are additive and retain historical rows. Financial fact
  persistence, provenance, job completion, and cursor advancement occur in one
  service-role transaction, so interrupted work cannot create false completion.
- Financial acquisition uses durable per-symbol/period jobs, bounded retries and
  a 45-minute lease. HTTP HTML, redirect blocks, schema failures, unavailable
  filings, and completed-but-insufficient research remain distinct terminal states.
- Point-in-time reads apply the frozen authority cutoff to filing publication,
  source, collection, and recording timestamps. Quarter/YTD algebra, basic versus
  diluted shares, normalized-cycle, PB, and forward models fail closed instead of
  manufacturing target prices.
- The three lifecycle stages are mutually exclusive. Found preserves every valid
  recent source hit; waiting requires defensible research and valuation; actionable
  additionally requires technical, market, confidence, risk/reward, and adjacent
  two-close gates. Wilder ATR and frozen signal-episode stops are deterministic.
- Source identity, stance, publisher concentration, PTT institutional-ranking
  exclusion, Telegram per-channel identity, GDELT validity, and Podcast RSS index
  policy are represented explicitly. Inactive or externally blocked sources do not
  masquerade as healthy scheduled ingestion.
- Dossier bundles are paginated and content-addressed. Submission binds the exact
  bundle/revision, validates fact relevance and derived arithmetic, rejects vacuous
  template prose, and atomically records its receipt. Public pages show numbered,
  human-readable citations while internal UUID fact IDs remain audit-only.
- Production-mutating research routes require exact internal bearer authorization
  and a database writer lease. Public requests are snapshot-only and cannot start
  background production writes. Failed publication keeps last-good data read-only
  and revokes actionable authority.
- Shadow v3 freezes cohort inputs in an immutable manifest, records every attempt,
  replays from the saved input rather than re-calling a live function, and counts
  only real qualifying trading days after research, detail, and atomic publication.
- Independent final diff and security reviews reported no findings. TypeScript,
  lint, source-ranking, candidate/shadow/performance, migration-contract, product
  correctness, production build, and diff hygiene all passed. The final browser
  acceptance run passed all 9 cases and verifies that audit revision IDs remain out
  of public article text on this exact subject.

## Closure

No P0, P1, or P2 finding remains. The subject is ready for protected checks, the
reviewed additive migrations, an atomic VPS release, controlled ingestion and
research cycles, and post-deploy canary verification.

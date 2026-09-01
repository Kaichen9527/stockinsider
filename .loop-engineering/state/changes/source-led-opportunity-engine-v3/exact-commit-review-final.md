# Exact implementation review — source research and Shadow v2

Date: 2026-09-02

Review authority: read-only review of the complete immutable diff, additive
migration, source dispositions, point-in-time research, valuation routing,
market fail-closed semantics, candidate detail publication, writer fencing,
Shadow v2 ordering, and VPS deployment controls.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `120fd35fb215e709adc3299c6367d6b0a68b356f` / `129a5ef9841d4d564a51a49b71190301b13d1755`
- Full final range: `9add16e5b2144613f237fa7246e5be323dbc838d..120fd35fb215e709adc3299c6367d6b0a68b356f`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- Active ingestion now separates health from disposition: successful-empty and
  duplicate-only runs remain healthy, while blocked, retired, manual-only,
  transport, schema, parser, and writer-fence terminals stay explicit.
- GDELT uses the official GKG archive with durable oldest-first cursors;
  Telegram is metadata-only; PTT bulk institutional rankings no longer create
  discovery candidates; Threads and BullTalk remain fail-closed behind their
  external authorization gates.
- Candidate research consumes point-in-time official authority, publishes a
  canonical market snapshot, applies the closed 17-symbol valuation routes,
  and never invents a target when official inputs cannot defend one.
- Candidate details no longer depend on a legacy decision revision. Every
  valid found symbol can expose provenance, technical state, valuation gaps,
  market context, and the ten-section factual research dossier.
- Shadow policy v2 freezes a source manifest, binds observations to the atomic
  publication ID and payload hash, counts terminal research coverage instead
  of confidence, and starts a real 0/30 live-trading-day window.
- Production writes are fenced to the activated VPS release and live database
  lease. Vercel schedules are removed and legacy hosts redirect to the VPS.
- Rejected dossier submissions retain hashes and reasons only; every accepted
  claim cites valid fact IDs, and each numeric claim matches its cited official
  fact value within the closed tolerance.
- The additive migration applied twice in a fresh PostgreSQL cluster. Candidate
  and Shadow tests passed 57 cases, source ranking 53, product correctness 150,
  migration 78, runtime/gate 63, and legacy regression 2. ESLint had zero
  errors, TypeScript passed, and the production build passed on the exact tree.

## Closure

No P0, P1, or P2 code finding remains. Production can still remain
`data_incomplete` when official market or valuation inputs are unavailable;
that is the intended fail-closed result and cannot promote an Actionable card
or a qualifying Shadow day.

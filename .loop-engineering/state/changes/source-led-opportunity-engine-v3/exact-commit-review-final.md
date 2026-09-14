# Exact implementation review — calendar loopback and dossier fact binding v16

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `ddaff007b9df598bc7a434c133f6b3863ec3085e` / `0762e42de7e0ad736d47c91622b44ab424d34783`
- Full final range: `95902b27827725d5ab07d17ec49fbcc771c344a8..ddaff007b9df598bc7a434c133f6b3863ec3085e`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- The official calendar systemd service pins `APP_URL` in the executed process after the protected environment file is loaded. A legacy public URL can no longer route the authenticated POST through the public reverse proxy.
- Candidate dossier fact binding reads the complete stock-specific bounded fact set and then selects only the exact identities required by the run. It no longer relies on an equal lower/upper `timestamptz` spelling that omitted newly committed rows for candidates without older authority facts.
- The existing 10,000-row hard cap and exact wanted-identity completeness check remain fail-closed.
- Regression contracts cover both the systemd precedence rule and the absence of timestamp bounds from the stock-specific binding read.

## Production evidence reviewed

- Before the unit fix, the scheduled process returned HTTP 403 because `/etc/stockinsider/stockinsider.env` overrode the unit's earlier `Environment=APP_URL` value.
- The same deployed script with an execution-time loopback override completed successfully: August accepted 42 duplicate rows; September accepted 18 rows, wrote the missing 12, and retained six duplicates.
- The completed official session authority advanced from 2026-09-03 to 2026-09-11 without inserting weekends or synthetic sessions.
- Two consecutive research runs failed the same 29 candidates with `candidate_detail_fact_revision_incomplete`; database inspection confirmed their run facts were committed under the run identity. The affected new candidates lacked an older fact that would widen the prior equality window.

## Security and correctness reasoning

- The internal API key remains in the protected environment file and is not embedded in the unit, repository, process arguments, or journal output.
- Calendar writes still pass exact official-page hashing, cross-market intersection, active-writer, schema, date, and authentication checks.
- Reading a stock's historical candidate facts does not broaden dossier authority: only identities in `wantedIds` are bound, every wanted identity remains mandatory, and overflow aborts the dossier.
- No validation, valuation, classification, freshness, or promotion threshold is weakened.

## Verification

- Candidate research tests: 28 passed, 0 failed.
- Taiwan provider and scheduler contract tests: 10 passed, 0 failed.
- Full product-correctness suite: 154 passed, 0 failed.
- TypeScript passed; ESLint passed with 33 pre-existing warnings and zero errors.
- Production build passed.
- `git diff --check 95902b27827725d5ab07d17ec49fbcc771c344a8..ddaff007b9df598bc7a434c133f6b3863ec3085e` passed.

This review covers the exact implementation commit. Deployment of this repair, a subsequent research rerun, and verification that the persistent 29-stock failure is removed remain separate rollout gates.

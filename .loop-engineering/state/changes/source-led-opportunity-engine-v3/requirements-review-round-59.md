# Requirements Review — Round 59

Date: 2026-07-26
Immutable tree: `9375ea4850f38502b9ff397b43065bd7bf09fa05`
Base: `1fe429d3a91359cd2d6d07c89441ebb66d9ccc5d`
Verdict: `CHANGES_REQUIRED`
Counts: `P0=3 P1=0 P2=0`

This was an independent fresh read-only Sol review of only the named immutable Git tree, exported at `/tmp/stockinsider-requirements-r60.isf6bE`. The reviewer reread the active requirements and contracts, inspected the runtime and migration implementation, and independently ran the product, trace, migration, model-runner, typecheck, lint and production-build evidence. Architecture was not run.

## Findings

1. `P0` — `AUTH-009` runtime and its acceptance owner are false-green. The seven authority manifests do not implement the required family-registry-first `bound+1` enumeration followed by indexed per-stream `LIMIT 65` reads. Six readers query event tables directly after cutoff filtering, and the peer reader does the same through a direct `DISTINCT ON`. Future-only streams can therefore disappear before the bound, sparse scans are unbounded, differing greatest-time ties are silently ordered, and revocation/expiry terminal semantics are not reproduced. The owner test only regex-checks all seven RPC definitions, then executes instrument 64/65, calendar 1024/1025 and one peer-reviewer boundary race; it does not execute every family boundary/future-only/race/zero-write case or every cutoff plan.
2. `P0` — The calendar view and begin revalidation do not implement `tw-trading-calendar-v3.4`. The view filters by `recorded_at <= close_at`, derives cutoff from `max(close_at)`, accepts any two completed rows without byte-equal schedules, hashes the wrong tuple and exposes three rather than five columns. `begin_opportunity_run_v3` trusts that view instead of independently resolving the greatest completed composite session at the exact supplied cutoff.
3. `P0` — The applied manifest catalog is not the exact v3.14 storage schema. Manifest pages lack `first_row_ordinal`, `first_identity` and `last_identity`; manifest rows lack `page_id`, `terminal_code`, `lookup_symbol` and `lookup_session`, and several stored names/relationships differ from the owner. The page RPC also omits terminal-code persistence. `MIG-004` remains green because its owner does not compare the exact table columns and relationships.

## Fresh evidence

- Migration: `18/18` passed.
- Model runner, including real network probes and model attempt: `15/15` passed.
- Product/public tests: `50/50` passed.
- Trace partitions: product `130`, evaluation `21`, model runner `1` passed.
- Typecheck, lint and production build passed.

These green results demonstrate the three false-green coverage gaps; they do not clear any blocker. Architecture remains locked pending a new immutable repair tree and a fresh Requirements PASS.

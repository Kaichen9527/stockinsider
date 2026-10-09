# Approved financial history storage amendment

The user's October 4/5 implementation plan explicitly requires repairing the
lifetime128 financial-series limit, preserving historical evidence and completing
official refresh only after real coverage validation. This is an additive schema
amendment, not permission to weaken the original base migration acceptance.

Preserve every immutable legacy fact ID, value, unit, provider and availability
timestamp. The economic period is stock/fact/duration/estimate kind/horizon plus
period start/end. Bound distinct disclosure revisions within that period at128,
not all genuine periods combined. Distinct revision identity retains value, unit,
provider, authority tier, original source reference, restatement and publication/
source time. Collection time describes an observation. Never merge undated
fallbacks solely by URL/value or invent their original publication time. Unit
changes and provider disagreements remain explicit. Currency and accounting
scope absent from legacy input remain explicitly unspecified; this amendment
does not claim to solve a richer economic-claim schema.

Reuse the existing series advisory lock, principal validation, recollection
idempotency, registry and deferred consistency checks. Add immutable observation
receipts atomically with append. Backfill only known legacy fact timestamps,
label them legacy facts; audit hashes do not reconstruct missing historical
observations. No direct service-role writes or public RPC execution.

Provide a cutoff-visible keyset reader, maximum128 rows plus one sentinel,
ordered by immutable recorded_at/fact_id with cutoff-bound cursor validation.
Return has_more/next_cursor and preserve every provider/revision. Existing
bounded latest-period readers remain unchanged; their failure must stay visible
if an unusually dense period exceeds their payload contract.

Acceptance: >128 genuine periods, original IDs, repeated collections and retries,
changed value/unit/restatement/provider, later revisions invisible at earlier
cutoff, complete pagination without duplicates, invalid cursor/size/auth denial,
bounded correction storms, additive apply twice, and existing base regression.
Installation uses only the existing independently reviewed extension path after
exact review and whole-host capacity admission. Measure index/query/storage
costs before production cutover; no raw emergency SQL or history pruning.

Installed successors cannot be replayed with a base-only migration plan. The
reviewed operator detects them before any mutation and requires their exact tail
migrations. The complete chain and all postconditions commit in one transaction;
only standalone transaction wrappers are removed using a SQL-aware scanner.
Embedded transaction control or nontransactional commands reject. Forced failure
after predecessor replacement must preserve the installed successor on rollback.

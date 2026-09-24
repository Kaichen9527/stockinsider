# Design
Extend existing candidate_detail_snapshots.provenance JSONB with a versioned, hashed trade-plan envelope. Keep append-only detail lineage and guarded producer; no schema migration.
Pure core owns formulas/typed states. A bounded authority adapter consumes existing official price/calendar/corporate-action records at the cutoff. Missing authority produces typed data gaps, not verified placeholders.
Assign the detail UUID before building its bound plan from a stable base-payload/version/authority seed; final revision_hash includes the complete envelope. Plan semantic identity excludes generated binding identity. Public readers validate stock, exact revision, hash and envelope shape. Radar summary is copied from that stored row, not latest technical data.
Frontend uses precomputed OHLCV, MAs, structures and prices only. Frozen decision remains unchanged when viewed later; stale/expired current viewing context is separately displayed.
Use existing Lightweight Charts and existing worker/publication paths. Bounded adapters preserve existing financial research on data errors; no GET writes. Review branch using tests, lint, typecheck, build, desktop/mobile fixture checks and independent review. No release PASS until required evidence exists.

The completed/cancelled session table cannot establish future openings. Acquire the existing official annual-calendar response once before fixing the run cutoff; merge already-known cancellation authority. Missing annual/transaction-time evidence fails closed. No calendar migration or weekday-only inference is introduced.

The shared official runtime validators live outside the Next web root. Generate byte-identical, ignored build inputs from an explicit three-file allowlist during web installation/build/development/checks. Keep the existing Next root and flat standalone packaging layout. The source of truth remains scripts/runtime; validate dependencies and parity instead of maintaining another handwritten validator.

The candidate UUID includes the complete base research metadata and unbound bundle. Rebinding the same payload is stable; changed run/cutoff/base metadata creates a new immutable revision. Plan identity is independent of candidate UUID and computedAt, but includes semantic availability/cutoff/evidence/policy. Cache the actual publication time within a retry; it is never backdated to source availability. Append collisions reuse only an exact UUID+hash match.

The summary is projected from the saved bundle, capped at 1,800 UTF-8 bytes and bound to the exact detail revision. Public card transport never includes candle arrays. Current stale/preliminary/expired presentation does not rewrite the frozen plan or formal classification.

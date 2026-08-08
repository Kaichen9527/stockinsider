# Requirements Round 59 Repair Evidence

Date: 2026-07-26
Base: `1fe429d3a91359cd2d6d07c89441ebb66d9ccc5d`
Prior Requirements verdict: Round 59 `CHANGES_REQUIRED`, `P0=3 P1=0 P2=0`
Fresh Requirements target: Round 60

## Repair Scope

This repair addresses all three Round 59 `P0` blockers before requesting a new immutable-tree Requirements Gate:

1. `AUTH-009` runtime and owner coverage now prove registry-first bounded authority resolution across all seven mutable authority families. The applied owner executes exact per-stream `64/65`, serialized global `bound-1 + 2` race, rejected-writer zero-event/zero-audit, future-only cutoff, and stream-index plan checks.
2. `tw-trading-calendar-v3.4` now uses the exact five-column effective Taiwan session view and begin-time independent re-resolution. The applied owner proves two completed equal schedules, cancelled/mismatched schedule exclusion, canonical 16:00 Asia/Taipei cutoff, bad-hash/noncanonical-cutoff rejection, and semantic tie fail-closed behavior.
3. Manifest persistence now matches the exact v3.14 page/row catalog. The applied owner proves exact page/row columns, indexes, deferrable page-row relationship, deferred validator triggers, terminal-code persistence, lookup symbol/session persistence, and 3MB page-bundle enforcement.

## Local Evidence

- Targeted authority owner:
  `node scripts/run-node22.js --experimental-strip-types --test --test-name-pattern='authority registries enforce' scripts/opportunity-v3/migration-contract.test.mjs`
  Result: `1/1` passed.
- Targeted catalog/plan owner:
  `node scripts/run-node22.js --experimental-strip-types --test --test-name-pattern='applied catalog exposes exact composite arities' scripts/opportunity-v3/migration-contract.test.mjs`
  Result: `1/1` passed.
- Full migration contract:
  `node scripts/run-node22.js --experimental-strip-types --test scripts/opportunity-v3/migration-contract.test.mjs`
  Result: `20/20` passed.
- Targeted acceptance owner inventory:
  `node scripts/run-node22.js --experimental-strip-types --test --test-name-pattern='canonical acceptance inventory' scripts/opportunity-v3/acceptance-traceability.test.mjs`
  Result: `1/1` passed after updating the migration-owner lifecycle sentinel to the new `20/20` suite count.

## Gate State

The Round 59 blocker set is repaired locally and ready to be sealed into a new immutable tree. Architecture remains locked until a separate fresh Requirements Gate over that tree returns `PASS` with `P0=0 P1=0`.

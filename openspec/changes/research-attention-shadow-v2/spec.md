# Research attention shadow v2 — proposed bounded amendment

## Problem and authority

The approved research ranking separates propagation from independent confirmation. Current v1 counts URL roots as independent and uses first acquisition time as weekly attention. A real March publisher note first acquired in October reproduced the semantic gap; two known same-publisher URLs without a parent link reproduce overstatement of independence. Existing v1 receipts, formulas, queues and hashes must remain unchanged.

This increment is a pure, bounded shadow comparison. It does not alter the production ranking, enqueue jobs, publish research, grant qualification or adopt a strategy. It introduces no DB, public API or model/provider dependency.

## Output and semantics

1. Preserve canonical source root/revision selection, point-in-time cutoff, withdrawal and metadata-only filtering used by v1.
2. Report acquisition discoveries separately from publication-based discussion. A root is recent discussion only if its publication is within the same trailing seven-day bucket; old material acquired today remains a discovery, never new discussion.
3. Preserve unique current root URLs as `currentRootCount`, not as verified independent confirmations. Report recent and prior-week publication root counts and acquisition root counts separately.
4. Independent confirmation requires a controller-supplied reviewed origin binding: exact root ID, exact revision ID, canonical publisher ID, independently established original-origin ID and evidence reference, all observed/reviewed no later than cutoff and no earlier than that source revision. Legacy `isOriginalSource` or an absent parent is insufficient. Bindings are inputs from a trusted reviewer/controller, not model authority; this pure function does not authenticate a caller or make them trustworthy.
5. Group conservatively and deterministically. For each reviewed origin, assign its bucket by the earliest publication among all eligible selected roots bound to it; this is the earliest known publication, not a claim of true first publication. A recent repost does not move an old origin to the recent bucket. Build a publisher–origin bipartite graph for all eligible bindings, and separately for each bucket. Count connected components, not rows, URLs or a greedy match. `(publisher A, origin X)`, `(A,Y)`, `(B,Y)` is one component regardless of input order. Same-publisher different topics retain distinct roots but do not become distinct independent voices. This conservative lower bound does not assert that all articles in a component have identical content.
6. Report `verifiedIndependentCount` as the all-time eligible component count, `recentIndependentCount` and `priorIndependentCount` separately, and `unknownIndependenceRootIds`. Missing bindings remain explicitly unknown; contradictory, duplicate or malformed bindings reject. Neither zero nor a missing binding means a source has been disproved or that no discussion exists. Never invent parent URLs or merge unknown authors by display name.
7. The recent interval is `(cutoff−7days, cutoff]`; the prior interval is `(cutoff−14days, cutoff−7days]`. A shadow attention level is the nonnegative increase of recent over prior component counts, capped at four. New acquisition of old material contributes zero. Preserve the 25/25/20/15/15 weight definitions, and expose v1 baseline separately. Do not overwrite the v1 score or introduce a new overall score in this increment.
8. Revised, contradicted or retracted sources follow deterministic v1 selection. A binding to a different/stale revision cannot authorize the selected revision. Origins shared across publisher IDs are one confirmation, preventing acknowledged reposts from increasing independent count.
9. Input cap is 20,000 roots and 20,000 bindings, each identifier at most512 UTF-8 bytes, URL/evidence reference at most2,048 bytes, each time string at most40 bytes, and total serialized input at most16MiB. Empty/whitespace identifiers and missing selected revision IDs cannot receive a valid binding. Reject unknown fields and invalid enum/time/order values before selection. Use sorting/maps/union-find, never pairwise scans. Output ordering is deterministic. All observations and reviews are point-in-time inputs, not retrospective proof of early discovery.
10. Preserve all fractional timestamp precision accepted within the byte limit for cutoff, clock-chain and bucket comparisons, including timezone offsets. The isolated v1-compatible selector rejects inputs whose equal millisecond revision clocks conceal different precise instants, or whose collation-equal selection keys differ exactly; reject either permutation rather than silently change live v1. Preserve the earliest exact observation string without millisecond truncation.

## Acceptance

- Old publication/new acquisition: acquisition increases, recent publication/verified attention do not.
- Two URLs/same verified publisher: retain both URLs, count at most one reviewed voice; no claim that topics are identical.
- Same origin/two publisher IDs: one confirmation. Two reviewed different origins and publishers: two.
- No origin binding, or only legacy original flag: independence remains unknown, contributes zero to verified attention.
- Different topics/same publisher remain distinct current roots, without two independent voices.
- Explicit parent roots retain v1 deduplication. Corrections/withdrawals invalidate stale bindings and remove ineligible confirmation; an original withdrawal outranks its repost as in v1.
- Future, invalid, contradictory, duplicate or oversized input rejects; equal-time revision ordering matches v1; input permutations produce identical output.
- Sub-millisecond future reviews and reviews preceding their precise source revision reject; fractional bucket boundaries remain disjoint. Collation-equal but distinct revision IDs and millisecond-tied but precisely different revisions reject in both permutations.
- Publisher–origin bridge chains have one conservative component; cross-bucket shared origins keep the earliest known publication bucket; exact seven/fourteen-day boundaries and multi-byte oversized identifiers are covered. A 20,000-root/binding bounded-input case is executable without a pairwise algorithm.
- v1 test suite remains unchanged and passes. Focused v2 tests, typecheck, lint and normal build pass; actual scheduled/production use remains disabled pending later adoption.

## Implementation ownership

Root owns a new pure library and focused tests plus this amendment. Existing VM owns publication/input work; existing priority/root files are read-only in this increment. Independent requirements/design review is required before code. The v1 selected-root helper may be reproduced in the new isolated module only with parity tests; no source extraction/refactor of the live v1 path is authorized here.

The existing `test:research-agents` package command may append this one focused test file so ordinary CI executes the new acceptance cases. No existing test, assertion, command or workflow gate is removed or weakened.

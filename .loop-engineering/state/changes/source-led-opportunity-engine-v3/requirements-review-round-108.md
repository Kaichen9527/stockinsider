# Fresh Requirements Gate Review — Round 108

Subject commit: `490645ebcf264b1ddc672d2b4cc691a48d05cf5f`
Subject tree: `d4ed5254271e54f660531609bff21e664936925e`
Baseline commit: `1b714a4303c2a97ebb913dced8d9d607a4ac8951`
Baseline tree: `463cdf53127a38553ecba80f31ad8cddb28ff6f1`
Reviewer: independent read-only `gpt-5.6-sol` / xhigh process
Verdict: `CHANGES_REQUIRED` (`P0=0`, `P1=8`, `P2=0`)

## P1 findings

1. Restoring `service_role` EXECUTE did not restore compact-stage completion. The
   security-definer wrapper is owned by `opportunity_v3_rpc_owner`, but that owner
   cannot read `legacy_radar_projections_v3_11`; the current test checks only the
   function grant rather than a real service-role completion call.
2. `legacy_decision_revisions_v3_13` still stores `source_led_correctness`, so the
   immutable revision row continues to contain mutable evaluation heartbeat state.
3. Decision revisions and evaluations reference retained compact projections with
   `ON DELETE RESTRICT`, which will abort the existing per-window 1,500-row
   projection-retention transaction when a referenced projection reaches the tail.
4. The immutable serializer preserves `sourceProvenance.evaluatedAt`, but the exact
   Decision Brief renders the removed `decisionEnvelope.evaluatedAt`, yielding an
   unknown immutable analysis-evaluation date.
5. The decision-revision ID preimage excludes disclosure fields that remain in the
   persisted immutable card. A price-only change can therefore produce one revision
   ID with two payload hashes and abort completion with a checksum conflict.
6. Formal peer selection prefilters active instrument and sector events instead of
   selecting the latest cutoff-eligible event before status classification. Older
   active events can be revived after an inactive/future superseding event.
7. A profile whose only acquired documents are rejected is reported as `fresh`
   because acquisition status depends on document-array length rather than accepted
   acquisition outcomes.
8. Equal-`evaluated_at` heartbeat rows can contain different correctness payloads;
   exact read orders and chooses one without comparing its two-row conflict sentinel.

## Prior finding disposition

- Round 107 P1-1 remains open: client EXECUTE is restored but the definer-side
  completion path lacks projection access.
- Round 107 P1-2 is partially closed: publication/collection/evaluation provenance
  survives serialization, but exact detail renders the wrong evaluation field.
- Round 107 P1-3 is partially closed: evaluation heartbeats are appended and exact
  lookup no longer scans newest projections, but immutable-row separation, conflict
  detection, projection retention, and same-ID payload stability remain incomplete.

## Evidence and gate disposition

The active graph reconstructed to 49 artifacts and 39 owners. Catalog SHA-256 was
`1aea3bc6949f964c75b8579373fd39f7fb077985418e3a8ca173465f6da5ad08`; active-graph
SHA-256 was `835349c0bde0519fc531ddb3702a98dc9991874516b1134251b37097963f5ad4`.
The canonical acceptance inventory remained version `1.45.0` with 308 IDs (260
product/runtime, 28 model-runner and 20 evaluation-governance).

The review audited seven commits and 43 files (+1,856/-366). TypeScript, changed
JavaScript syntax, active JSON parsing, and focused DI-001/DI-004/DI-005 diagnostics
passed. PostgreSQL, Playwright, build and other write-capable diagnostics were not
run under the independent read-only constraint. The subject worktree and index
remained clean, and no production or external write occurred.

Requirements Gate is `FAIL / CHANGES_REQUIRED`. Architecture remains blocked until
all eight P1 roots are repaired in a new immutable tree and another independent fresh
Requirements review returns `P0=0` and `P1=0`.

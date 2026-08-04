# Requirements Round 88 Repair

Status: repair candidate only; this document is evidence, not a Requirements PASS.

## Subject and scope

- Round 88 reviewed tree: `f913b8725c36663906aa890b767aaa9ccf6473ca`
- Repair tree: emitted after these exact bytes are sealed; a Git tree cannot embed its
  own object ID without a self-referential hash.
- Reviewed active graph: `1bb1128bb1e7fcab1a367dc91abed315963740e09efd208329c85eb373c39187`
- Repaired active graph: `e307c67fb116237880bb04dfbdfe7913b779cdcea9275f6f8a7b1605bdd8f0d3`
- No production database mutation, migration application, runtime installation, V3 flag
  change, scheduler activation, merge, push or deployment occurred.

## Closed findings

1. **P1 — shallow PCR vectors:** deleted the compact positive/mutation-vector claim.
   Every PCR now has one canonical fixture and an exact existing production owner. The
   normal PCR test explicitly fails `PCR_IMPLEMENTATION_PENDING` until that owner
   executes the full canonical setup and expected behavior. A partial page-count or
   fixed envelope cannot make Code Gate green.
2. **P1 — disconnected semantic sidecars:** deleted all `*-semantics` and pending
   wrappers plus inert `void` imports. The baseline only resolves actual worker,
   source, valuation, decision, market, projection, doctor, governance or workspace
   sources; Node-loadable owners also require a named export and consumer edge.
3. **P1 — self-attesting runner:** package bootstrap now reads the runner from
   `git show HEAD:scripts/opportunity-v3/acceptance-gate-runner.mjs` into frozen Node
   under `env -i`; the runner requires an absolute reviewed root and clean detached
   worktree before subject launch. A dirty runner copy cannot execute before validation.
4. **P1 — incomplete/impossible CI:** product/runtime script now contains trace,
   ordinary PCR, migration, V1/V2 regression, typecheck, lint, build, Playwright and
   performance commands in contract order. Model-runner includes disabled-mode doctor
   and host-pin validation. PR aggregate requires only executable product/runtime;
   evaluation is non-blocking diagnostic and model-runner remains a separately gathered
   pinned-host Code Gate input, never an always-skipped aggregate dependency.
5. **P1 — 290/297 conflict:** active hybrid partition prose and current task summary
   now state the exact 297 canonical IDs with `143/148/6` classification.
6. **P2 — durable lineage:** Round 85–88 reviews, Round 85–87 repairs, current
   status/tasks/gate summary and this repair evidence are carried in the candidate tree.
   The Loop state now names Round 88 as historical CHANGES_REQUIRED and Round 89 as the
   only next gate.

## Focused checks

- All 31 PCR real-owner declaration children passed, each emitting exactly one
  fixture-bound pending record with no skips/todos. This includes representative worker
  (`PCR-001`), funnel (`PCR-010`) and workspace (`PCR-024`) owners.
- In a clean detached temporary verification carrier, focused GOV-004, GOV-001 and
  HYB-006 passed 3/3. A temporary dirty `process.exit(0)` injected into the worktree
  runner caused the reviewed-blob package bootstrap to fail first with `gate root must
  be clean before subject launch`; the modified runner bytes never executed.
- The old sidecar imports have no remaining source references.
- JSON inventory, Markdown mirror, frozen script rows and gate-authority rows are
  regenerated from tracked candidate bytes; their final digests are recorded after the
  immutable tree is written.

## Required next action

Run an independent Sol XHigh Requirements Round 89 against the repair tree. It must
return `P0=0 P1=0` before Architecture Round 10 or any implementation work may begin.

# V3.19 fresh Requirements review — readonly bootstrap closure

Date: 2026-08-27

Review authority: independent, read-only Requirements review of the immutable
V3.19 readonly-bootstrap repair candidate. No runtime, database, Vercel or source
operation was performed as part of this review.

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `688ba7b2ab730407dc0c42a953d49a583925e6b5`
- Original candidate commit/tree: `e82cb6ddbaab7ada092678181715a58b4ff682b7` / `b5b7dc992c4162e17bbf4cb7634b90af70521223`
- Final repair-closure commit/tree: `e82cb6ddbaab7ada092678181715a58b4ff682b7` / `b5b7dc992c4162e17bbf4cb7634b90af70521223`
- Full reviewed range: `688ba7b2ab730407dc0c42a953d49a583925e6b5..e82cb6ddbaab7ada092678181715a58b4ff682b7`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Requirements closure

The production activation sequence exposed a circular rollout dependency: the
reviewed runtime and manifest must exist before the matching Web build can be
deployed, while activation previously required that already-deployed Web to
identify as the new runtime commit. The repair admits a known, well-formed
predecessor consumer only as `activated_readonly_bootstrap`. It still requires
a valid projection checksum and fresh-or-stale projection, requires the
consumer/producer incompatibility to remain explicit, and accepts no health
reason outside the closed readonly set. A missing or malformed consumer
identity still fails activation. The state remains action-disabled until the
matching reviewed Web is deployed; this closes ordering deadlock without
granting recommendation authority to an incompatible consumer.

The second reviewed production retry confirmed that the database observer
returned both the active run lease and the exact reviewed producer commit, but
the composed installer observation omitted `producerCommitSha`. The
first-heartbeat contract therefore could not compare the observation to the
reviewed release and timed out even though the worker was healthy. The repair
adds one pure producer-heartbeat projection shared by the composed doctor
observation. It carries the producer identity together with run/terminal and
lease state, and its regression asserts the complete object. No fallback,
wildcard identity or consumer-derived substitute is admitted.

The reviewed production retry proved that lease acquisition now completes
inside its heavyweight bound: the new run was durably created and heartbeated
in fourteen seconds. The installer nevertheless rolled it back because health
classified an empty job-lease set as `absent` while the first heavyweight job
claim was still materializing. The runtime health contract already exposes the
run-level `lease_expires_at`; the repair treats that bounded run lease as the
first activation heartbeat only when the run is `running` and no job lease is
visible. A visible job lease remains authoritative once present, multiple job
leases remain invalid, and expired or terminal run leases cannot pass. This
closes the activation race without extending the two-minute installer budget or
weakening terminal-run, scheduler-owner, manifest, consumer or projection gates.

The production forensic activation showed that lease acquisition materializes
the same bounded frozen authority pages as job claim, but the PostgreSQL adapter
sent acquisition through the ordinary 20-second query path. The database work
was still bounded and idempotent, yet the client cancelled it before the
reviewed 1,200-second transaction bound and the scheduler could never obtain a
first job lease. The repair routes only lease acquisition and claim through the
existing heavyweight transaction helper, explicitly sets both the local
PostgreSQL statement timeout and the node-postgres query timeout to 1,200
seconds, and keeps every other read/write RPC at 20 seconds. Transport replay
remains limited to the acquisition/claim operations whose database identities
are immutable and idempotent; append and completion writes are not replayed.

V3.19 closes a release-integrity delta without reopening the completed V3.18
gate. The amendment is present in the active artifact catalog and defines one
release path, rather than another numbered repair loop or a Goal/heartbeat
automation. The durable release checkpoint has a closed, monotonic phase set:
`workspace_ready`, `contract_passed`, `implementation_reviewed`,
`runtime_staged`, `run1_terminal`, `web_deployed`, `run2_terminal`,
`verified`, and `closed`.

The installer now has a bounded two-minute activation handoff: scheduler
registration and first durable heartbeat are the installer boundary, while a
producer owns its terminal outcome. The activation journal remains reentrant;
a recovered installation must either restore the preceding owner or complete
the new owner. The release remains fail-closed for action authority until the
reviewed runtime, manifest, migration, producer and Web identities agree.

Source acquisition has a bounded, append-only and source-led authority path.
An authorized document revision is persisted before it becomes a frozen source
revision or enters claim extraction. The additive cursor advances only after a
completed source-sync transaction and bounds selection to documents changed
after the prior consumed high-water mark. Exact review found that a timestamp
alone is not a total cursor order: a provider batch can legitimately persist two
revisions at the same timestamp. The single repair carries both `recorded_at`
and `revision_id`, compares that lexicographic pair on selection, and writes the
same pair after consumption. A same-run successor is released only from its
just-persisted frozen revision; metadata-only, rejected, unchanged,
provider-failed and OAuth-unavailable outcomes remain typed terminal outcomes
and cannot become thesis. Official market data can validate, enrich or reject a
source-nominated symbol, never nominate it. InvestAnchors and Telegram admit
only operator-authorized structured claims with stock context and citation; raw
member or message text is not acquired, retained, rendered or model input.

Every checksum-valid research card receives exactly one non-executable
readiness lane (`actionable`, `near_action`, `wait_condition`, or
`data_needed`). Missing data, a stale runtime or a common infrastructure fault
preserves last-good research and a navigable same-revision research detail; it
cannot manufacture a buy recommendation or erase the card. The Decision
Envelope remains the sole action authority. V3.19 exposes a bounded compact
projection and keeps the full dossier behind its matching revision, including
valuation scenarios, fundamentals, technical state, thesis, risks, citations,
dates and explicit blockers.

The protected product track additionally exposed stale catalog and release-task
metadata left behind by the V3.19 amendment. The repair binds the current
54-file/44-owner catalog identity in both executable and evidence authority,
includes the V3.19 product-correctness owner in the immutable script registry,
and parameterizes the active-release task assertion by the machine-readable
release version. The complete 272-PCR trace then reaches only its expected
owner set, and the CI recheck remains the release authority.

The current protected base also advances the exact Codex host fixture to
`model-runner-host-pins-v3.13`. The repair closes the full dependent authority
set: catalog SHA, both canonical catalog tags, the frozen script-value digest,
and the amendment oracle all bind the same base-owned `0.150.0-alpha.8`
identity. This is a closed exact-value repair; no version range, compatibility
fallback, bypass or candidate-selected host identity is introduced.

The migration is additive and RLS-protected. Capacity policy only observes and
fails closed below the reviewed disk floor; it does not delete evidence. No
database password reset, credential rotation, LINE, dispatch, auto-trading,
V3 Promotion or public mutating endpoint is introduced.

## Executable evidence examined

- Product/runtime correctness baseline: `134/134` PASS, including all `PCR-001` through
  `PCR-031`; zero failed, skipped or todo.
- Focused activation/REST-doctor regression: `25/25` PASS, including active,
  expired, terminal, job-owned and multiple-lease cases.
- Migration contract/rehearsal suite: `62/62` PASS.
- Source-led unit suite: `61/61` PASS; legacy V1/V2 regression: `2/2` PASS.
- Browser V3 correctness suite: `9/9` PASS.
- Performance suite: `5/5` PASS.
- `lint`, TypeScript typecheck, production build and
  `git diff --check` for the immutable subject all PASS.

This Requirements PASS authorizes one independent Architecture review and then
the exact-commit review path only. It does not authorize migration, runtime
activation, Web deployment, a claim of future investment returns, or a change
to evaluation governance. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` until real cohorts mature.

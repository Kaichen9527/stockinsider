# Initial runner trust establishment — decision required

Status: concrete governance proposal only; no bootstrap installed, ruleset changed,
required check waived, credential/key created, native pin changed or main merged.
Owner confirmed in this chat on2026-10-11 that **no existing recovery procedure
exists**. Do not ask for that nonexistent procedure again. This confirmation is
not approval of a branch-protection exception or a new authority key.

## Frozen scope and actual capability

- Main/predecessor: `169aad1b6cfa747f78ae3464b614f43c0749d806`.
- Existing runner listing: `fafab4f391e8bc077a0e2ec7ed10d1f4afc02bfbc77006ccdb436640e5e77161`.
- Application candidatePR364: `2e078dfdd74272d3d50dffdd4cc6c14df3152c78`; keep frozen.
- Actual protected run38130037645: requirements, architecture, exact-review and
  product272/272 pass; model fails before tests at missing old executable path.
- Read-only ruleset20177392 snapshot: active, no bypass actors, required
  `stockinsider-v3-gate-root` from Actions integration15368. No settings mutated.
- Current Mac runner21 is online/idle. Fresh strict native signature verification
  and `--version` succeeded: `codex-cli0.162.0-alpha.17.2`, Team2DC432GLL2, SHA256
  `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`.
  This does not prove sandbox/model oracle/auth/whole-app/Gatekeeper compatibility.

## The circular dependency

The workflow checks out the protected PR base; its first model sandbox starts
the removed executable. Candidate pins, new scripts or signatures have no
consumer there. That same required check gates a PR which would update the
consumer. A new key cannot authenticate its own first installation. GitHub admin
permission does not make the failing check pass. No in-repo ordinary command
can both keep this exact old authority unchanged and install its replacement.

The earlier repair authorization remains valid for ordinary code, tests, pushes
and merges after actual required checks. The prior prohibition on bypassing
protected publication remains valid too. It cannot be silently interpreted as
permission for first establishment outside the old gate. This is a new governance
decision, not another request to authorize the same routine repair.

## Minimal decision offered to the owner

**OptionA: separately authorize a one-time, owner-controlled infrastructure
bootstrap exception.** This explicitly changes the old merge-authority condition
for exactly one frozen recovery PR; it is not a claim that the old model check
passed. The applicationPR364 is excluded from the exception. Prepare a minimal
independently reviewed worker/fixture/registry transition and genuine
current-native harness evidence first. A general recovery service, new key
registry and cross-host installer are not prerequisites for this initial
decision; those remain a separate subsequent design.
Only the owner can authorize and supervise its first landing under that amended
policy. This option requires an explicit new decision before any ruleset/admin
action; no exception has been created or exercised.

**OptionB: retain the current no-exception policy.** Preserve the four actual
passes and continue source/content/strategy work in isolation. Merge/deployment
remain blocked unless the original fully pinned host can be legitimately
restored. No such complete restorable host has been established.

Do not offer “rerun”, “make a symlink”, “change the pin in PR364”, “mark success”,
“disable all checks”, or an agent-generated signing key as solutions.

## Acceptance and execution sequence if OptionA is explicitly chosen

1. Open a distinct recovery-only PR against the exact predecessor. Freeze its
   source/tree before approving any exception. Do not mix application2e, database
   migrations, strategy approval or production secrets into its runtime scope.
2. Reuse PR288 protocol/routing and PR317/318 parser/lifecycle work only after
   exact-source review and compatibility checks. Old1d92/e94d installation planners and native evidence
   are historical, not permission or current-native facts. Produce a current
   narrow worker/fixture/registry transition, not another inactive generic plan.
3. Define the first trust anchor explicitly: authenticated repo owner as initial
   establishment authority, separately identified independent reviewers, exact
   permitted installation/registry paths and the external verification process.
   Signing identity, if used, must be newly established through that owner ceremony
   and recorded as such; synthetic test keys never count as production authority.
4. Independently review requirements, architecture and the entire final recovery
   diff. Re-measure executable/bundle signatures, hashes, version and permissions.
   Execute real sandbox denial/credential isolation, JSONL/parser/lifecycle tests
   and the current model oracles under the reviewed isolated recovery harness.
   Missing capabilities or failures remain blockers; never emit an old-gate PASS.
5. Bind reviewed source, current predecessor, host identities, review evidence,
   actor, expiry, exact targets and single-use transition to a durable receipt.
   Select and independently verify the actual platform primitive for predecessor
   CAS before execution; retain failed/uncertain reservations. GitHub merge API
   head-SHA checking alone does not prove atomic base+candidate CAS. If that
   primitive is unavailable, record the missing capability rather than
   claim this phase executable. No secret or runtime-provider credential is placed in Git.
6. Present the **final exact commit and receipts** to the owner before the first
   landing. Scope any exceptional GitHub operation as narrowly as the platform
   actually supports. GitHub rulesets do not prove a bypass actor is limited to
   one PR/SHA; do not claim this guarantee. If the chosen mechanism cannot
   enforce the agreed scope, stop for a concrete decision instead of temporarily
   disabling broad protections. First landing is explicitly exceptional and
   externally audited; it is not ordinary protected approval. No direct agent
   push to main or fabricated status is permitted.
7. Restore/confirm the normal required check and no bypass actors before any
   application merge. Fresh base-owned five-input execution must genuinely pass
   onPR364 (rebase/review if needed); then merge by merge commit, apply the reviewed
   atomic database installer, deploy the verified Linux package and check pages.
   The exception does not authorize application release, formal schedules or
   investment strategy adoption.

## Subsequent recovery design

The newly established control plane should provide a separate authenticated
recovery entry with pinned, independently reviewed verifier code and durable
single-use predecessor state. An app/CLI update must fail closed and preserve its
observations; it must not trap every future repair behind the removed binary.
Release/hash/signature can be durable identity with before/after file identity
checks per launch only if that new race/ownership design is independently approved.
No such identity relaxation is made by this proposal.

## What is executable now

Completed now: factual owner-answer record, fresh read-only native signature and
version observations, current GitHub ruleset/runner snapshots, independent
architecture assessment, and this decision packet. Normal source research can
continue. Creating/using the new trust authority, altering a ruleset or landing a
recovery PR is **not authorized by this packet**. A complete code implementation
and fresh tests of that new control plane remain future work if OptionA is chosen.

# StockInsider V3.11.1 — Requirements Round 90 Repair Candidate

## Result

Round 90 code/configuration repairs are sealed in immutable implementation subject
commit `031c1c7fb9e531c063a44ac650db10b8b7a39582`, tree
`a94bdc03cc8076c50e6437c9fc229652815c4d88`, directly derived from Round 90 evidence
commit `0294bbf517e8d110c029059fc81e34a6da434b52`.

This is a repair candidate, **not** a Requirements PASS, Architecture PASS, Code Gate
PASS or live external-authority assertion. The exact implementation repair range is:

```text
0294bbf517e8d110c029059fc81e34a6da434b52..031c1c7fb9e531c063a44ac650db10b8b7a39582
```

It changes 16 tracked paths (`1,132` additions, `234` deletions), contains no whitespace
errors, and its final 48-file/38-owner active graph is SHA-256
`faa2d901576b9eaaef95e2bc596b3ba0029a331c00053ca904255055476457c5`.

## P1 repair mapping

### P1-1 — Protected external root

The candidate supplies the required source-level bootstrap components:

- `.github/workflows/source-led-opportunity-external-gate.yml` owns the
  `pull_request_target` `stockinsider-v3-gate-root` check from the PR base commit;
- `scripts/opportunity-v3/protected-gate-root.mjs` verifies the event/base/head handoff,
  hashes its base-tree release and emits a canonical bootstrap attestation;
- `external-gate-release-registry-v1.json` allowlists release
  `stockinsider-v3-gate-root-v1` with bootstrap SHA-256
  `b653e54c093d2475e7b5476b2eba9b7e85b979f2a5fb8e60a6d7740031398c33`; and
- `external-gate-harness-contract.md` explicitly constrains the bootstrap to a
  base-owned handoff and fails closed for missing external provenance.

The local harness simulation emitted the registered attestation. This repair cannot
prove the workflow is live: the workflow has not been merged to the protected base, no
administrator-configured required check or retained GitHub artifact was observable, and
no GitHub configuration was mutated. A repository administrator must perform and make
that external condition observable before Round 91 can accept this root.

### P1-2 — Forged check evidence

`scripts/opportunity-v3/gate-evidence.mjs` now enforces fixed track partitions
(`249/28/20`), check-specific command labels, accepted version, direct evidence
parent/range/tree/byte identities, active-graph reproduction, registry ancestry and
registered release identity. Its tests reject nonexistent review lineage, arbitrary
release hash, command substitution and a one-of-28 model result.

### P1-3 — PCR fulfillment record

The evidence contract defines the exact closed 31-row fulfillment schema, fixed path
and exact-review relationship. New canonical writer
`scripts/opportunity-v3/write-pcr-fulfillment-record.mjs` seals the fixtures and
distinct owner/caller/run evidence; `gate-evidence.mjs` resolves and validates that
record from exact-review evidence. Missing, partial, token-only, same-file or
digest-mismatched records reject the gate.

### P1-4 — Typed PCR trace

`acceptance-traceability.test.mjs` now derives the expected baseline from the exact
typed PCR boundary instead of comparing it with the retired string literal. The
PCR-boundary version is `source-led-opportunity-pcr-boundaries-v3.11.2`.

### P1-5 — PCR-030 caller

PCR-030 now declares
`web/src/lib/opportunity-v3/projection.ts#loadOpportunityEngineV3` as its caller, rather
than a same-file serialization symbol. The trace enforces distinct owner and caller
paths, and the focused baseline passed.

## Verification

| Check | Result |
| --- | --- |
| `npm run test:source-led-opportunity-v3` | PASS — 53/53 |
| Focused PCR-030 requirements baseline | PASS — 1/1 |
| Local protected-root harness simulation | PASS — registered bootstrap attestation emitted |
| Frozen complete product trace | PASS — 131/131, 0 fail/skip/todo |
| `git diff --check` over repair range | PASS |

The first full trace found two stale active references to acceptance `v3.11.11` in
`design.md` and `product-correctness-runtime-amendment.md`. Commit `031c1c7f` reconciled
both to the active `v3.11.12` contract, and the final full trace then passed.

## External bootstrap observation

After the bootstrap PR was merged to the protected-base candidate, a real GitHub
`pull_request_target` run was executed:

```text
repository: Kaichen9527/stockinsider
workflow: .github/workflows/source-led-opportunity-external-gate.yml
check: stockinsider-v3-gate-root
run: 30692927942
baseCommitSha: 37c00d122086ad2b2ce80e6675dfb8ade1006e35
subjectCommitSha: b85d50a0eeab8c46c79a6fcbdc23f8c2cfead1fc
conclusion: success
artifact: stockinsider-v3-gate-bootstrap-b85d50a0eeab8c46c79a6fcbdc23f8c2cfead1fc
artifactId: 8816290195
artifactDigest: sha256:49bc6603ecc4c978651c570665de76281838fe45bbefd21d54dc0eb9cce2d0f1
artifactExpiresAt: 2026-10-30T09:01:37Z
```

The downloaded artifact was independently inspected. Its attestation binds the exact
repository, workflow/check, base SHA, registry commit/tree, registry blob digest,
registered release digest, subject SHA and subject tree. The repository administrator
then created and activated the GitHub Ruleset through authenticated Settings access:

```text
rulesetId: 20177392
rulesetName: stockinsider-v3-gate-root
enforcement: active
target: default branch (main)
requirePullRequest: true
requireStatusChecks: true
requiredCheck: stockinsider-v3-gate-root (GitHub Actions)
requireBranchesUpToDate: true
bypass: empty
```

The resulting GitHub page displayed `Ruleset created`, `stockinsider-v3-gate-root
Active`, `Applies to 1 target: main`, and `Status checks that are required /
stockinsider-v3-gate-root`. This closes the server-side required-check prerequisite
for P1-1. The check/artifact and ruleset are external observations; they do not by
themselves constitute a Requirements PASS.

## Stop condition and next action

Architecture Round 10 and implementation remain locked. No PR, push, merge, deployment,
migration, runtime installation, scheduler/cron, flag or production action occurred.

The server-side required-check prerequisite is now observable. The live protected-base
check, immutable artifact and active `main` ruleset are all recorded above. After this
repair evidence is sealed in a new immutable tree, use **Sol XHigh** for
Requirements Round 91 over this candidate; only `P0=0 P1=0` can unlock independent
Architecture Round 10.

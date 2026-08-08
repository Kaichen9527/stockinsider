# External Gate Harness Contract

Contract version: `source-led-external-gate-harness-v1.4`

## Protected bootstrap and required administration

The initial authority is the GitHub `pull_request_target` job/check named
`stockinsider-v3-gate-root` in
`.github/workflows/source-led-opportunity-external-gate.yml`. GitHub executes that
workflow from the pull request **base** commit, not from the candidate subject. The job
checks out only `github.event.pull_request.base.sha`, fetches the subject object without
checking it out or executing it, and runs the base-owned
`scripts/opportunity-v3/protected-gate-root.mjs`.

That root validates the GitHub event's repository, base SHA and head SHA against a clean
base checkout. It reads the active
`external-gate-release-registry-v1.json`, hashes its own base-tree blob, and publishes
one immutable `stockinsider-v3-gate-bootstrap-<subjectSha>` artifact. Its output is a
closed `stockinsider-external-gate-attestation-v1` record. The bootstrap has deliberately
limited scope: it proves the base-owned release/subject handoff; it does **not** claim a
Requirements, Architecture, model, exact-review or Code Gate PASS.

Before any Code Gate PASS is accepted, a repository administrator must configure
`stockinsider-v3-gate-root` as a required check for the protected default branch and
retain artifacts for at least 90 days. The registry release must consequently be merged
to the protected base *before* a subject can use it. An attestation whose registry commit
is not an ancestor of the event base is invalid. A candidate cannot introduce a registry
and use it to attest itself in the same PR.

Missing branch protection, missing root check, missing bootstrap artifact, missing
external worker, unknown release, cross-base handoff or any candidate-supplied
attestation is `external_harness_attestation_unavailable`. It is fail-closed. This source
tree cannot assert that a GitHub administrator has completed the external configuration;
that fact is established only by a live protected check/artifact.

## Registry and handoff

`external-gate-release-registry-v1.json` is an active immutable artifact with exactly:

```ts
type ExternalGateReleaseRegistryV1 = {
  schema: 'stockinsider-external-gate-release-registry-v1';
  issuer: 'stockinsider-v3-gate-root';
  repository: 'Kaichen9527/stockinsider';
  protectedWorkflowPath: '.github/workflows/source-led-opportunity-external-gate.yml';
  protectedCheckRun: 'stockinsider-v3-gate-root';
  releases: [{
    id: `stockinsider-v3-gate-root-v${number}`;
    bootstrapPath: 'scripts/opportunity-v3/protected-gate-root.mjs';
    bootstrapSha256: string; // exact 64 lowercase hex of the base-tree blob
  }];
};
type ExternalGateAttestationV1 = {
  schema: 'stockinsider-external-gate-attestation-v1';
  repository: 'Kaichen9527/stockinsider';
  workflowPath: '.github/workflows/source-led-opportunity-external-gate.yml';
  checkRun: 'stockinsider-v3-gate-root';
  baseCommitSha: string;
  registryCommitSha: string;
  registryTreeSha: string;
  registryPath: '.loop-engineering/state/changes/source-led-opportunity-engine-v3/external-gate-release-registry-v1.json';
  registrySha256: string;
  releaseId: string;
  releaseSha256: string;
  subjectCommitSha: string;
  subjectTreeSha: string;
};
```

All SHA-256 members are exactly 64 lowercase hex; Git commit/tree members are exactly
40 lowercase hex. The base-owned root emits this object with canonical RFC 8785 bytes.
The external worker must retrieve that immutable artifact through GitHub's protected
run/artifact API rather than accepting a candidate upload. It executes the registered
track commands in a detached clean subject checkout with no GitHub credential inherited
by subject processes, then emits the result envelope below.

For `model_runner`, candidate processes receive only a non-credential placeholder HOME
inside the base-owned read-only/network-denied sandbox. The two live pinned-host probes
run later in the credentialed protected-base process only after `git ls-tree` proves the
complete subject model-runner directory, wrapper and host-pin blob IDs byte-identical to
the protected base. The candidate suite registers thirteen non-live tests with zero
skip/todo; the exact-byte protected oracle registers the remaining two. The worker
derives the 28-ID partition count from the trace TAP summary and separately requires
every mandatory suite/oracle summary to have zero failed/skipped/todo; it never writes a
hard-coded passed count.

## External result envelopes

Every required input is a canonical RFC 8785 envelope:

```ts
type ExternalGateEnvelopeV1 = {
  schema: 'stockinsider-external-gate-envelope-v1';
  issuer: 'stockinsider-v3-gate-root';
  harnessReleaseSha256: string;
  subjectCommitSha: string;
  subjectTreeSha: string;
  attestation: ExternalGateAttestationV1;
  result: GateResultV1;
  resultSha256: string;
  issuedAt: string;
};
```

`harnessReleaseSha256` must equal the registered base-tree bootstrap digest. The
candidate-side `gate-evidence.mjs` is a strict compatibility verifier, never the
bootstrap authority: it resolves the registry commit/tree/blob, enforces registry
ancestry to the protected base, verifies every identity/digest, and rejects arbitrary
release strings. The external worker independently verifies the GitHub artifact/run
provenance before invoking this compatibility verifier.

The protected worker publishes one immutable
`opportunity-gate-result-<check>-<commitSha>.json` artifact per input. It invokes the
Code aggregate only with `requirements`, `architecture`, `product-runtime-code-gate`,
`model-runner-code-gate`, and `exact-review` in that order. The diagnostic PR workflow
continues to publish no authoritative Code Gate result; blocked evaluation governance is
not a Code input and remains a Promotion blocker.

## PCR transition and fulfillment

`pcr-implementation-boundaries-v3.json` began as the immutable Requirements-side plan
and now records the current reviewed implementation boundary for each PCR. A green PCR
must also attach the
non-active, exact-review evidence file
`.loop-engineering/state/changes/source-led-opportunity-engine-v3/pcr-fulfillment-record-v1.json`.
Its closed canonical schema and validator are specified in
`acceptance-evidence-contract.md`; `gate-evidence.mjs` resolves it from the exact-review
evidence tree. Missing, same-file-only, token-only, unrelated, incomplete or digest-
mismatched fulfillment causes exact-review/Code Gate rejection.

# Inactive recovery installation proposal

This is a reviewable dry-run and external validation interface. It does not
install an executor, establish a trust root, reserve a predecessor, register
review sources, publish a check, or authorize a release. An independent reviewer
must review this proposal's exact commit before an external authority adopts it.
The existing protected worker does not import it. Ordinary chat/code reviews and
local tests are not signed independent evidence.

## Two different source identities

The subject remains PR #288 commit
`e94d21f9fe05dc436211a2458ea59adb52195e26`, tree
`94e8dd37fdeb3a4f6fb9923224e2150ee8b3e3dc`. Its predecessor is
`169aad1b6cfa747f78ae3464b614f43c0749d806`, tree
`fb62be71161857affbaa8ea8ed7f4d7921a4b3c9`. This proposal's later commit is
**installer proposal source**, not a replacement recovery subject. Do not
regenerate subject facts from HEAD, move PR #288 to this branch, or treat these
new files as part of e94d21f's completed source review.

The immutable subject facts at
`/Users/kaerchen/.cache/stockinsider-workspaces/recovery-routing-final-facts.json`
have SHA-256
`76d5da032f3c4c5c2ccc8b38958226018f720f26f5f5331cd2d5e3f7f73f089d`.
The planner pins the entire canonical LF-terminated file, including the native
and application identities. Tests reconstruct it from immutable Git objects.
The older `recovery-final-facts.json` is a different historical subject.

The unchanged packet verifier is pinned at
`79cbe3dac6356aa658ef3eb6b2e8a70c0c7d9a0d15bed1756eee1c39e41e1ac8`.
The predecessor-scoped consumption key is
`9a81db5124b7a8f9eae2fb65c32f65007a9177c80f9a6f99b61a87192bada088`.
This key does not change with a nonce, signature or installer proposal.

## Safe local preparation

Run from the recovery clone, with the existing Node 22 runtime:

```sh
/Users/kaerchen/.nvm/versions/node/v22.23.3/bin/node \
  scripts/opportunity-v3/host-recovery-install-plan.mjs --dry-run \
  /Users/kaerchen/.cache/stockinsider-workspaces/recovery-routing-final-facts.json
```

This prints a canonical unsigned plan to stdout, listing 24 missing deployment
fields and eight external evidence obligations. It reads only the two explicitly
specified bounded input files. It writes no file. Optional third argument is an
absolute path to a canonical JSON **deployment proposal**, not a trust source.
Unknown keys and execution, signing or trusted-context CLI flags are rejected.
Even a fully populated proposal retains `activationAllowed: false` and
`protectedGatePassed: false`.

The deployment contract has exactly these externally supplied fields. No actual
production values for them have been supplied or inferred:

| External responsibility | Required fields |
| --- | --- |
| Existing administrative recovery authority and ingress | `authorityId`, `entryPointId` |
| Independently reviewed, installed control-plane release | `controlPlaneCommit`, `controlPlaneTree`, `controlPlaneBundleSha256`, `plannerSha256`, `packetVerifierSha256` |
| Reviewed base-owned worker bundle and immutable manifest | `workerBundleSha256`, `workerManifestSha256` |
| Installation scope, ownership, staging, switching and service contract | `installationRoot`, `stagingRoot`, `activeSlotId`, `serviceId`, `atomicInstallProtocolSha256` |
| Exact independent review source registry and write protocol | `reviewRegistryId`, `reviewRegistrySha256`, `registryWriteProtocolSha256` |
| Durable atomic predecessor ledger and protocol | `ledgerId`, `durableCasProtocolSha256` |
| Existing principal's scoped installation permission | `permissionPrincipalId`, `permissionReceiptSha256` |
| Reviewed route to the recovered protected base and its workflow | `recoveredBaseCommit`, `recoveredBaseTree`, `protectedWorkflowSha256` |

The protocol hashes name actual separately reviewed protocol bytes, not arbitrary
strings asserting atomicity. Their bytes, worker manifest, registry bytes and
permission receipt must be furnished to and verified by the external control
plane. The worker manifest must bind this subject's fixture/listing/graph and the
reviewed base-owned launch policy; a hash alone does not prove those semantics.
Root paths require independent realpath/ownership/ACL/mount checks, including
symlink and parent-directory races. The parser's path syntax check cannot prove
any of those properties. No installation root or CAS/storage technology is
assumed. The external system must define crash consistency across worker,
registry and base publication, and the legally authorized route by which the
new protected base becomes authoritative with all required checks preserved.
No such route is implemented in the present base.

## Exact signing inputs and pure validator

First freeze the proposal/control-plane release and the deployment contract.
Measure their exact source and bundle hashes externally. Generate the final
canonical plan. Each of the three external review authorities supplies its
immutable report bytes and a canonical LF-terminated evidence envelope:

```json
{
  "schema": "stockinsider-host-recovery-install-review-v1",
  "role": "requirements | architecture | exact-review",
  "candidateCommit": "e94d21f9fe05dc436211a2458ea59adb52195e26",
  "installationPlanSha256": "SHA256(exact canonical plan bytes including LF)",
  "deploymentContractSha256": "SHA256(canonical deploymentContract plus LF)",
  "reviewReportSha256": "SHA256(exact external report bytes)"
}
```

This example is explanatory, not a valid envelope. Each role uses its exact
literal role value. All three reviewers review the whole installation contract,
including control-plane source, worker protocol, review registry, permission
scope and CAS failure behavior. The unchanged packet protocol signs the envelope
byte hash in each review statement, together with payload hash and PASS verdict;
the owner signs payload plus all signed review statements. Thus the owner and
reviewer signatures bind the installation plan transitively without changing
the frozen packet verifier. Changing the plan, contract, report, release or
subject invalidates that binding and requires new real signatures.

The pure interface is:

```js
validateRecoveryInstallationHandoff(planBytes, packetBytes, trusted)
```

`trusted.packetContext` is the existing packet verifier's external context, with
`reportBytes` added to each `reviewSources[role]`. `trusted.deploymentContract`
is the independently verified contract. `trusted.readiness` contains the six
exact observations specified by the validator: durable CAS, permanent failure
retention, installation permission, current predecessor, fresh host identity and
installed control-plane release. **These strings are a typed interface for an
already trusted caller, not proofs or authenticated receipts.** The caller must
authenticate, verify and freshly measure the underlying evidence using its
pre-existing authority registry. There is no CLI or candidate file that can
supply trusted context. Importing the module in arbitrary JavaScript does not
make the caller trusted.

The validator rejects absent/altered context, incomplete contracts, expired
packets and mismatched independent evidence. A successful return still says
`executionAuthorized: false`, `predecessorReserved: false`,
`activationAllowed: false`, `protectedGatePassed: false`. It is a validation
result, never a bearer token or evidence that an installation occurred.

## Minimum finite external operation sequence

These are required adapter contracts for a future independently reviewed
installer. They are **not implemented adapters** and must not be replaced by
local files, shell commands or synthetic receipts.

1. `verifyExternalContext(plan, packet)`: authenticate the authority/three
   distinct reviewers (all distinct from maker), remeasure immutable Git, host
   identity and installed control-plane release, inspect current protected base
   and required-check rules, verify permission/registry/protocol bytes. Supply
   trusted clock and context to the pure validator. Reject any changed source or
   unavailable check. Reading a packet cannot grant missing administrative power.
2. `consumePredecessor(transitionKey, packetSha256, planSha256)`: atomically create
   one durable record before any staging, installation or registry action. Return
   a durable receipt identifying the ledger, transaction and all three exact
   arguments. Duplicate, timeout, lost acknowledgement, partial commit or outage
   blocks execution. Retain the record on every later failure, even if install
   never starts. Never delete it to retry. A newly reviewed external recovery
   decision is required after consumption.
3. `stageExactBundles(receipt, contract)`: verify receipt and exact immutable
   control-plane/worker/manifest bytes, ownership and permissions in the supplied
   staging root. Keep credential and candidate network separation. Stage no
   arbitrary old binary or candidate-selected executable.
4. `installWorkerRegistryAndBase(receipt, stagedArtifacts, contract)`: use the
   supplied reviewed atomic installation/publication protocol and existing
   scoped permission. Its crash behavior must leave the authority closed on
   mixed worker/registry/base versions. Return measured installed identities;
   remeasure host inode/content/signatures immediately before any launch. Never
   derive permission from this plan or grant membership/ruleset bypass.
5. `runFreshProtectedChecks(installedReceipt, candidateCommit)`: obtain a fresh
   `pull_request_target` run from the reviewed recovered protected base and exact
   workflow bytes; require all five inputs, including both live model/host
   oracles. The fixed root context remains `stockinsider-v3-gate-root` from GitHub
   Actions integration `15368`. Do not synthesize or reuse check conclusions.
6. `verifyProtectedRun(runIdentity, installedReceipt, candidateCommit)`: verify
   exact head/base/run/check identities and authentic successful input/root
   conclusions. Only the existing protected release workflow can then progress.
   Product merge, production schema application and deployment are separate.

The external installer must serialize this sequence and independently enforce
expiry/revocation/freshness at its defined irreversible boundaries. The pure
validator neither holds a lock nor prevents TOCTOU. Any uncertainty fails closed
and preserves a consumed predecessor. A system unable to implement the reviewed
cross-resource protocol cannot recover by weakening it to best-effort writes.

## What remains external

No owner-signed packet, signed plan-bound independent reports, authority/key
registry, durable ledger, deployed control-plane bundle, base-owned installation
permission or recovered-base publication contract is present. The 24 fields are
therefore intentionally absent in the local dry run. No live oracle or actual
installation was performed. Synthetic test keys exist only in test process
memory. Local passing tests cannot supply any missing authority.

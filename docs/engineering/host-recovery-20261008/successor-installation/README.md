# Exact 1d92 successor installation proposal

Status: inactive, unsigned implementation candidate; independent review and VM
validation of THIS planner are pending. It cannot install, reserve, sign, create
trust, register a graph, publish a status check, merge or deploy.

## Source identities and concrete artifacts

The recovery subject is exactly `1d92e04e26c393c6d9c32b549854281e3f29f115`, tree
`855a50b220f755b37680f7ed02163d1198d6c482`. Its protected predecessor remains
`169aad1b6cfa747f78ae3464b614f43c0749d806`, not e94d or this planner's new commit.
The planner's eventual commit is a separate control-plane proposal identity;
reviewing it does not alter the frozen subject or automatically install anything.

- `source-facts-1d92.json` is the immutable Git source-facts output, SHA-256
  `7dd015469853502fbfbfc41fefd798b9eb66420768d361a80c93bbf2237726e1`.
- `unsigned-plan-1d92.json` is actual dry-run output with absent external contract,
  SHA-256 `e8e6bc1f5067d0bec58819f012bf55b94f9e285b4ebfdaf134262783a8077117`,
  4,798 bytes. It names all 28 missing deployment fields and cannot validate a
  handoff until those fields and genuine external evidence are supplied.
- `entrypoint-observation.json` records this bounded authenticated GitHub API and
  immutable-source inspection. It is an observation, not an authority grant.

The new `scripts/opportunity-v3/native-1d92-install-plan.mjs` accepts only that
whole canonical LF-terminated source-facts hash and candidate commit. It does not
accept a caller-selected subject. The old `host-recovery-install-plan.mjs` stays
byte-identical and continues to reject these facts; the new planner rejects the
old e94d facts. The original `host-recovery-packet.mjs` is also byte-identical.
Their separation is intentional: the old planner is not generalized and old
signatures do not become approval for this native successor.

Safe preparation command:

```sh
node scripts/opportunity-v3/native-1d92-install-plan.mjs --dry-run \
  "$PWD/docs/engineering/host-recovery-20261008/successor-installation/source-facts-1d92.json"
```

An optional absolute third file supplies an unsigned deployment PROPOSAL.
Canonical closed schemas and 128 KiB input bounds apply. There is no trusted,
registry, signing, execute or install CLI. Successful dry run always reports
unsigned/inactive, activation false and protected gate false.

## Existing registry binding, never self-bootstrap

The 24 external deployment fields from the earlier proposal remain required.
Four additional fields bind the actual established registry and worker source:
`authorityRegistryId`, `authorityRegistrySha256`,
`authorityProvenanceReceiptSha256`, and `protectedWorkerSha256`.
No actual values for these authority fields have been fabricated.

The pure `validateRecoveryInstallationHandoff(planBytes, packetBytes, trusted)`
interface requires the following additional externally supplied bytes:

| Context input | Exact binding |
| --- | --- |
| authorityRegistryBytes | authorityRegistrySha256; closed canonical public-key registry below |
| authorityProvenanceReceiptBytes | authorityProvenanceReceiptSha256; existing external provenance instrument |
| durableCasProtocolBytes | durableCasProtocolSha256; reviewed durable predecessor CAS protocol |
| permissionReceiptBytes | permissionReceiptSha256; authenticated base worker/registry/publication permission |
| workerManifestBytes | workerManifestSha256; closed exact subject/host/worker/base manifest below |

Every input is nonempty and bounded to 128 KiB. Opaque protocol/provenance/
permission bytes are HASH-BOUND, not interpreted as a newly invented deployment
protocol. The independently installed caller must authenticate their provenance,
issuer, authorized scope, revocation/freshness and operational semantics before
supplying trusted context. A correctly hashed arbitrary string is not authority.

The public registry schema is `stockinsider-established-recovery-registry-v1`:
exact fields `schema, registryId, authorityId, makerId, owner, reviewers`.
`owner` and each of the three fixed `reviewers` roles (`requirements`,
`architecture`, `exact-review`) contain only `principalId, publicKeySha256`.
Fingerprints are SHA-256 of Ed25519 public keys exported as SPKI DER, and must
match the actual external owner/reviewer keys used by the unchanged packet
verifier. Owner and all reviewers must have distinct principal identities and
keys; none of their principal identities may equal the maker's. This strengthens
independence for this new proposal only; the historical verifier is unchanged.

`trusted.readiness.establishedRegistry` must state
`externally_authenticated_preexisting_registry_and_host_recovery_scope`, in
addition to the six prior measured readiness obligations. These typed strings
are not signatures, receipts or proof of establishment. There is no candidate
file or CLI that supplies trusted context, and importing this module does not
make arbitrary JavaScript a trusted caller. No function here can authenticate
or create its own calling control plane.

Each of the three independently signed review envelopes uses schema
`stockinsider-native-1d92-install-review-v1`, exact role, candidate commit, plan
SHA-256, deployment-contract SHA-256 and immutable review-report SHA-256. The
unchanged review signature binds the envelope hash and packet payload; the owner
signs payload plus all three signed reviews. Thus registry/provenance/worker/CAS/
permission identities in the contract are transitively bound by all signatures.
Ordinary chat review, an unsigned scoped pass, or the Apple native code signature
is not this owner recovery grant.

## Worker identity and durable transition boundaries

The proposed canonical worker manifest schema is
`stockinsider-native-1d92-worker-manifest-v1`. It must contain exactly:

- `predecessor` and `candidate` tuples from frozen source facts;
- the exact `activeGraphSha256, hostFixtureSha256, nativeIdentitySha256,
  recoveryVerifierSha256, permissionPolicySha256` from those facts;
- `workerBundleSha256, protectedWorkerSha256, recoveredBaseCommit,
  recoveredBaseTree, protectedWorkflowSha256, reviewRegistrySha256,
  atomicInstallProtocolSha256` from the reviewed deployment contract.

A substituted worker, historical host, different graph or different recovered
base fails validation even when the altered manifest itself has a matching hash.
The external operator still has to verify real bundle contents, installed source
and permission scope. This module neither downloads nor executes worker bundles.
The manifest is a proposed interoperability interface; no existing installer is
claimed to implement it yet.

The finite external sequence remains: authenticate exact external context;
durably consume the predecessor once before any installation action; verify and
stage exact bundles; atomically install worker/registry/recovered base under the
reviewed external protocol; run fresh base-owned protected checks; verify all
five inputs and root, including both live oracles. Duplicate, unavailable or
uncertain CAS blocks execution; consumption is permanent even after failure.
Expiry/revocation and host identity must be checked at the real irreversible
boundaries. This validator does not hold a lock or eliminate TOCTOU.

Even with a complete valid packet, return values remain
`executionAuthorized:false, predecessorReserved:false, activationAllowed:false,
protectedGatePassed:false`. The returned value is not an installation token.
Actual CAS/install/publication/run adapters remain absent. No grant is generated
and no nonce/predecessor is reserved by this implementation.

## Actual accessible entry points and separate gate failure

The authenticated GitHub API still exposes the protected workflow
`324989200`, driven by `pull_request_target`; no recovery ingress was found in
the bounded workflow/ref/comment/variable inspection. Repository Actions
variables are empty, PR295 and PR311 comments are empty, Production has no
protection rules, and ruleset 20177392 remains active without bypass actors.
These observations do not rule out an undocumented off-host private authority.

The readable tracked `external-gate-release-registry-v1.json` registers the
bootstrap source hash, not owner/reviewer public keys or installation rights.
The other existing installer authenticates only `tracked_runtime_activation`
using the nonsecret reference `keychain:stockinsider-runtime:activation-authority-hmac`.
It installs the auth-source worker, not the protected recovery worker/registry/
base. Its key existence/value was not queried, and that source cannot expand
its own authenticated mutation scope into host recovery.

For exact 1d92, actual run 37775736497 has successful bootstrap but failed
requirements/architecture/exact-review/root and skipped code gates. The
requirements job failed in `Retrieve bootstrap and prepare detached subject`:
`protected external gate worker failed: requirements active graph evidence source`.
The real log line and API identities are preserved in the observation. PR312's
same-category failure was reported by the parent; it was not polled again here.
The native identity correction does not register this new active graph or create
exact-head review authority. A successful bootstrap merely prepares the bound
subject; it does not override the missing graph-bound evidence source.

## Minimum next operator action and validation handoff

The missing first external action is a read-only export/reference from an
ALREADY authorized recovery operator: its public established registry and
provenance instrument, recovery ingress reference and authenticated permission
scope for the base worker/registry/recovered-base publication. Request references
and public material, never a private key or keychain secret. If that authority
does not exist, the separately approved institutional bootstrap contract is still
missing; generating a local key or recording a chat approval is not a substitute.

Once that source exists, the operator supplies its actual reviewed worker/bundle,
CAS and atomic publication protocols, fills the exact deployment contract,
obtains three plan-bound independent reviews and the owner's genuine signature,
and validates fresh current-host evidence before any durable reservation. This
proposal prepares those concrete inputs; it cannot make the external permissions
or protected review registry appear.

Mac work was limited to syntax checks, bounded dry-run generation, source reads
and authenticated read-only API inspection. No test key/signature was generated
in this preparation turn. The portable tests generate disposable synthetic
in-memory cryptographic fixtures only when run; they never establish a registry,
write a real key/credential or grant permission. Their complete-context fixture
is deliberately labeled synthetic and validates only a nonexecuting result.

Queue on the VM, with the immutable predecessor/e94d/1d92 objects available:

```sh
node --test scripts/opportunity-v3/native-1d92-install-plan.test.mjs \
  scripts/opportunity-v3/native-successor-contract.test.mjs \
  scripts/opportunity-v3/host-recovery-install-plan.test.mjs \
  scripts/opportunity-v3/host-recovery-packet.test.mjs \
  scripts/opportunity-v3/protected-external-gate-worker.test.mjs
npm --prefix web run build
```

Do not replace missing protected GOV-004 harness evidence with a local PASS.
The parent's prior receipt at 132f24b99881e716d3b2c642ac3073ca10d9f1c8 concerns
native source 1d92, not this new planner. This exact planner commit needs separate
VM results and independent review. No self-approval, protected registration,
main mutation, real install, model call, paid API or deployment occurs here.

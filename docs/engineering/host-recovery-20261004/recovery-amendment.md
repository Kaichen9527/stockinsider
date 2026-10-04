# One-time external host recovery proposal

Status: unapproved control-plane design; candidate preparation only. This is not
an active contract, a protected check result, or a registration of this PR.

The protected base is `169aad1b6cfa747f78ae3464b614f43c0749d806` (tree
`fb62be71161857affbaa8ea8ed7f4d7921a4b3c9`). It starts an absent native path,
registers successors only through v3.18, and has no review sources for this
candidate's active graph. Its workflow accepts only `pull_request_target`.
Re-running it or adding `workflow_dispatch` on a candidate cannot create trusted
authority. The required root check and ruleset must stay enabled.

## Proposed trust boundary

The inactive `scripts/opportunity-v3/host-recovery-packet.mjs` is a small validation
library. No existing protected worker imports it. An independently reviewed,
owner-installed external control plane would pin its exact bytes before use.
That installation and its trust roots must be external to the subject checkout.
Candidate-controlled arguments, environment variables, keys, files, claims of
review, and fixtures cannot supply the library's `trusted` context.

The owner authority signs canonical RFC-8785-compatible JSON containing the full
payload and three independently signed review statements. The payload binds:

- Repository, external authority ID, random nonce, issue time and expiry within
  24 hours. Expiry is checked against the external control plane's clock.
- Predecessor commit, tree and complete model-oracle Git listing digest.
- Final candidate commit, tree and complete model-oracle Git listing digest.
- Exact active graph, complete LF-terminated host fixture, native and bundle
  identity object, recovery verifier source and adapter policy source digests.
- The authenticated maker identity. Requirements, Architecture and exact-review
  use three distinct external reviewer identities and distinct Ed25519 keys,
  none naming that maker. Each review signs its role, evidence byte digest,
  payload digest and PASS verdict. The external system supplies the matching
  immutable evidence bytes and previously established public keys.

The review evidence must cover the whole recovery design, final candidate range,
native signatures, source scope and worker/policy changes; this library validates
the signatures and bindings, not the human truth of review prose. The external
control plane must verify review independence and authentic source provenance
before supplying that evidence. Locally generated test keys are never authority.

Validation returns `protectedGatePassed: false`. The transition reservation key
is the repository plus predecessor tuple, independent of nonce, candidate or
signature. The external ledger must atomically insert once, durably commit before
any execution and retain the reservation after every failure. A second request,
ledger outage or uncertain reservation fails closed. A retry after consumption
requires a newly reviewed external recovery decision, not deletion of history.
The library deliberately does not offer a file-based pseudo-ledger or perform
any activation, source write, credential read, check creation, merge or deployment.

## Owner's minimum external action

There is no observed self-service path in the present protected base. The owner
must provide a separately trusted administrative recovery authority capable of
installing a reviewed recovery control plane and registering the new base-owned
worker/review sources while preserving branch protection. If no such authority
already exists, establishing it is a real prerequisite; this proposal does not
claim that adding a signing key alone can satisfy the GitHub required check.
No ruleset removal, bypass actor, forged success, ordinary candidate workflow or
arbitrary replacement of the old executable is an acceptable substitute.

Before that authority acts, freeze the final candidate commit and generate its
unsigned facts **outside the checkout** using:

```sh
/usr/local/bin/node scripts/opportunity-v3/host-recovery-proposal.mjs \
  /Users/kaerchen/.cache/stockinsider-workspaces/astra-recovery-oct04 \
  169aad1b6cfa747f78ae3464b614f43c0749d806 FINAL_CANDIDATE_COMMIT \
  /Users/kaerchen/.cache/stockinsider-workspaces/recovery-final-facts.json
```

The facts tool reads Git objects without executing candidate files. It uses the
same trimmed `git ls-tree -r --full-tree` model listing convention and active
graph preimage as the existing gate. Its output is expressly unsigned. An
independent trusted implementation must recompute it from immutable objects,
re-measure the host and code signatures immediately before the authorized
operation, and bind the three signed reviews and owner signature. Evidence goes
in a later external record so final commit/tree binding has no self-hash cycle.

The reviewed recovery installer/worker must validate from the trusted predecessor
context, select exactly the authorized new native fixture before candidateSandbox
launch, and repair its minimal/parent/transport policy without admitting candidate
credentials or network. It must register exact immutable Requirements,
Architecture and exact-review evidence sources for the new graph. This PR does
not yet implement or activate that external installer: its trust anchor and
permitted administration channel do not exist in the current repository base.
These are explicit outstanding tasks, not implied capabilities of the verifier.

After registration, a fresh PR event against that new protected base must execute
all five protected inputs and the root aggregate, including both live host/model
oracles. Failure remains a failure. A passing recovery packet is never a substitute
for those checks. Product source review, migration, release and deployment remain
separate checkpoints.

## Runtime identity decision

This candidate retains exact persistent device/inode/size/owner/mode, content
hash/version and native/app signatures. It moves to fixture v3.22 and a fresh
`model-runner-v3-astra-v2` state namespace. A future design may use release
hash/signature as durable identity and measured device/inode only for one launch's
TOCTOU checks. Such a change needs its own independently reviewed race/ownership
and launch-boundary design; it is not silently adopted here.

The 15 initial protocol tests exercise exact binding, signatures, review identity,
expiry, canonical bytes, replay and unavailable ledger. They use synthetic keys
and an in-memory ledger only. These tests establish local protocol behavior, not
the existence of the external authority, durability, protected gate or live model
compatibility.

# Bounded recovery follow-up — 2026-10-08

Result: no newly verifiable host-recovery entry point was found in the bounded
public/source inspection. A NEW native identity mismatch means the old e94d
recovery subject is no longer eligible on the current host, independently of
its pre-existing external authority gaps. VM product work can continue; this
record neither authorizes nor blocks unrelated VM development.

## Newly measured host mismatch

The native binary was hashed and `codesign -dv --verbose=4` metadata inspected.
No model, credential access, full test suite or installation was run.

| Identity | Frozen e94d expectation | Observed October 8 |
| --- | --- | --- |
| SHA-256 | 6b582e8813ce7e8ed4c52814ee5cf230dba647bf2292df747a4003f2657ef201 | cb4e4994627e770800a940b42969c77855a3fc09a6e60b02aa6319f670d6b6ab |
| inode | 199114789 | 204774021 |
| size | 241555024 | 245160576 |
| gid | 80 | 20 |

Device 16777232 and uid 501 remain equal. Signature metadata reports identifier
`codex`, TeamIdentifier `2DC432GLL2`, CDHash
`b466a2b6d25d4ea321c8cd253bd3436b1142b1b1`. Metadata inspection is not complete
signature/notarization/launch validation; the current CLI version was not inferred.
Neither the old candidate pin nor its unsigned facts were updated.

An owner signature on the old packet would NOT cure this mismatch. Do not replace
the old binary, loosen inode/hash checks or reinterpret an old review as a review
of these bytes. A newly measured successor needs its own final source/tree,
source facts, independent review, host checks and external signed recovery plan.
Alternatively an actually matching, independently authorized executor could be
considered; none was discovered and no matching host is claimed here.

## Existing authority paths inspected

PR288 remains draft e94d on protected main 169aad1, blocked. PR295 remains draft
73e0aed on e94d, unstable. Both PRs have zero GitHub reviews/comments at this
observation. Neither exact-head review ref exists. The workflow registration is
unchanged, and ruleset 20177392 remains active with no bypass actors and
`current_user_can_bypass: never`. The required root is tied to GitHub Actions
integration 15368. PR295's branch base is itself the inactive PR288 candidate;
merging that stack cannot bootstrap protected main authority.

There IS a distinct existing installer source on protected main:
`scripts/runtime/reviewed-runtime-installer-cli.js`. Its authority schema is
`stockinsider-runtime-activation-authority-v2`, mutation
`tracked_runtime_activation`, HMAC reference
`keychain:stockinsider-runtime:activation-authority-hmac`, with a 15-minute
window and exclusive/fsynced nonce records. This is a concrete source reference,
not proof that the key, grant or service is presently provisioned. No keychain
lookup or key value read was performed.

Its installation manifest names `scripts/runtime/auth-source-worker-cli.js` and
`config/runtime/auth-source-dag.json`; the protocol activates that launchd data
source runtime. It neither registers protected model-runner successor/review
sources nor grants a recovered-base publication route. Its nonce ledger is not
the predecessor-scoped host-recovery CAS. Reusing this key/CLI/ledger for host
recovery would expand trust beyond the authenticated mutation and is excluded.
The similarly named production-authority-bootstrap CLI was only identified as
tracked source; it was not invoked or treated as a host-recovery trust root.
Exact protected-source hashes are recorded in `status.json`.

## Authorization distinction

The human's continuing instruction authorizes preparation, independent review
and already permitted VM/product work. It does not create the external Ed25519
owner recovery grant that the proposed packet protocol verifies. A chat review,
repository admin role, GitHub PR review, arbitrary new local key or runtime HMAC
activation grant cannot be substituted for that host-recovery grant.

The lack of public refs/comments is a bounded observation, not proof that no
private external authority exists. None was supplied or referenced in the
inspected source. No new grant, signer registry, durable predecessor CAS or
base-owned installation/publication permission was established by this check.

## Minimum executable preparation and external dependencies

1. **Completed here:** preserve e94d and 73e0aed; freeze this dated mismatch and
   authority-scope record on a separate documentation branch. No current pin or
   installer code was changed. This is the only presently concrete recovery
   mutation performed: local nonsecret documentation.
2. **Next source preparation:** create an explicitly scoped successor proposal
   for the current native identity, then freeze its exact commit/tree and
   independently review its pin, runner/adapter permissions and live-oracle
   contract. Existing e94d facts and the old plan hashes cannot authorize it.
   This step creates reviewable source, not trust or activation. It must not be
   silently folded into the old subject.
3. **External operator must provide:** an authenticated reference to an existing
   administrative host-recovery entry point, its previously established owner
   and three independent reviewer public-key identities, and its verified
   permission to install the base worker/registry and publish a recovered base
   while preserving the required check. Credential values are not requested.
4. **Before any installation:** that operator must provide the exact reviewed
   bundle/manifest and atomic worker/registry/base publication protocol, durable
   predecessor CAS with permanent failure retention, and genuine fresh signed
   plan/report/owner evidence for the new frozen subject and measured host.
   Validation precedes durable consumption; any unavailable or uncertain CAS,
   stale/mismatched host, absent permission or signature mismatch remains closed.
5. **After a legally installed recovery:** run fresh protected inputs and root,
   including the required live oracles. Passing source tests or this record is
   not a substitute. Only then can the existing merge/deployment sequence use
   the resulting authority.

If no existing external entry point can be identified, a separately authorized
institutional bootstrap contract is still missing. The current source cannot
supply its own trusted root, and this record does not authorize a ruleset change,
manual successful check, main push or installation. No repeated failed workflow
was dispatched. The parent can continue VM PostgreSQL/PostgREST and research
without waiting for these external recovery prerequisites.

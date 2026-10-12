# Initial trust migration implementation handoff

Frozen implementation: `f30beda55adc7c11ad42b1f2490e5742651173c9`, tree `36495327684494a2aa8b4798ce3d89615f1d6516`; predecessor candidate `892c93e2d4d44e863be9b6aed7407cf975e905b4`; protected main `169aad1b6cfa747f78ae3464b614f43c0749d806`.

This is an implementation handoff, not independent approval, a signature, a protected PASS, activation or deployment. The human-authorized exception applies only to the independently reviewed release-tool PR. Application PRs still need every normal check.

## Implemented

- Exact current nested native path/version/hash/signature/stat fixture v3.25; strict shared loader and doctor. No environment pin selector, symlink fallback, learned identity, legacy doctor equivalence or alternate binary. Canonical fixture reads are nonblocking, size-bounded and checked through the same stable descriptor; executable streaming hashes reject growth/replacement.
- Runner v3.10, manifest/routing v3.7 and permissions v3.6; Sol 6.1 High make, Astra High review and verify. Strict JSONL parser and bounded lifecycle from PR317/318 are included in the original governed runner suite. New namespace prevents old journal/reservation reuse. Candidate-only fixed refusals are removed; real host/auth/parser/sandbox/identity checks remain mandatory.
- Closed new model listing-to-host-pin mapping. It accepts that listing when it is the protected base; the current old main still rejects the transition. No predecessor self-approval was added.
- Worker auth path now derives from the operating-system account, as the runner already did. Expired reuse evidence is still forbidden for actual reuse; a different exact listing can take the independently executed live path instead of being blocked merely by the unrelated old artifact expiry.
- Finite model contract, acceptance command/hash, identity and catalog mirrors updated. Product acceptance version/count/owner partition, product/runtime SQL, strategy and production authority remain unchanged.
- Explicitly authorized evaluation diagnostic workflow repair: install the exact locked Web dependencies with `npm --prefix web ci --ignore-scripts` before evaluation imports. No condition, assertion, threshold or strategy changed. That workflow has not been rerun by this agent.

## Exact identities and bounded checks

- Model listing SHA-256: `80703945942d7823cdcaa34972dc7225b96fad83f82befe00d88d81c2648c86a`.
- Active graph SHA-256: `ad4e4d1910b320476c09d50736651d705701902d6c1478f9ee65fa3d5ab798dc`.
- Native SHA-256: `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`; version `codex-cli 0.162.0-alpha.17.2`.
- Fixture canonical pre-LF SHA-256: `e10f04c5fff073c6c03109af457d2fe9597db83c6f7f5b719fa6412cbcf151a4`; 2,251 bytes plus one LF.
- Runner identity SHA-256: `04e4f083dfabed992e0f9101e7983efe4987d2ce2871a288647a68b5f7afa5f8`; 906 canonical bytes.
- Frozen f30 independent-of-provider local command: `OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH=1 /usr/local/bin/node --test scripts/model-runner-v3/model-runner-v3.test.js scripts/opportunity-v3/runner-recovery-candidate.test.mjs scripts/opportunity-v3/protected-external-gate-worker.test.mjs scripts/opportunity-v3/runner-installation-contract.test.mjs`: 127 pass, zero fail/skip.
- Fresh full public codesign metadata, designated requirements, strict verification and Gatekeeper succeeded. The fixture comes from these observations, not from an old candidate.
- Current sandbox policy canary: 14/14 synthetic filesystem/network checks. Actual native Node controller → pinned Codex sandbox → pinned Node → unchanged run-node22 → pinned Node: arm64, v22.14.0, `/usr/local/bin/node`. This is the actual local startup chain; it does not claim a GitHub Worker job ran.
- Exact source listing checks: same listing returns `protected_base`; old protected main rejects the new listing; unknown listing has no host-pin map entry.

The frozen raw files retained outside the tree are:

| Evidence | SHA-256 |
|---|---|
| `/tmp/stockinsider-f30-frozen-focused-oct12.tap` | `d0a669a060c49fac350ccae51204228e085235e66bb8115814bc03e961217f6f` |
| `/tmp/stockinsider-f30-frozen-native-chain-oct12.json` | `9a8ca10db228e8305e82b395261bf01a4565fe9b8076f9fbd3c26857ba06df64` |
| `/tmp/stockinsider-f30-frozen-source-facts-oct12.json` | `44aadf2b029a1693133a6e490953cff42c79ccde44fe91e54614514809291262` |

## Preserved RED and limits

`initial-tests.tap` preserves the erroneous transitional test selector expecting rejection of the very selector it had just accepted; the successor corrects the negative selector to historical v3.9. `sandbox-canary.json` preserves two newly added exploratory chain negatives: Python runs under x64/Rosetta and caused universal Codex/Node to inherit x64; the model-command profile correctly refused Node's ungranted OpenSSL read. The valid native controller probe exercises the external-gate runner chain instead. The model-command profile was not expanded to accommodate an unnecessary Node child. `sandbox-policy-canary.json` retains the original fourteen security checks on current bytes.

The old 892 candidate's 103/14 evidence remains unchanged under `runner-recovery-20261011`; it is not relabeled as current live evidence. No auth file contents, provider/model call, package install, full build, protected run, host registry mutation, GitHub rule change, merge, DB/VPS mutation or deployment occurred in this task. Initial disk availability was about 1.6 GiB.

A live-wrapper boundary remains for independent review before provider execution: `real-model-attempt.js` directly invokes `executeModel` and unconditionally removes its temporary directory in `finally`, whereas the normal `executeOperation` path retains resources for `ownership_lost`. The ordinary caller's passing lifecycle tests do not prove that oracle wrapper's failure cleanup. This is explicitly not claimed closed here.

## Minimal remaining sequence

1. Independent requirements, architecture and code review of the exact migration implementation, including the live-wrapper failure boundary above. The implementer does not write its own PASS.
2. Genuine requirements and architecture evidence must each be the reviewed commit's unique direct child and carried by the eventual subject, using the existing `captureReview` grammar. Register only their exact refs/paths against the graph above in the closed worker map. These refs are currently absent; `graph-pending-review.json` records that fact. Worker registration is outside the active graph, so the exact reviewed graph can remain stable. Recheck final code/graph/listing after that finite registration change.
3. After review authorizes the live probe, an operator may reproduce the public-only host probe with:

```sh
/usr/local/bin/node scripts/opportunity-v3/runner-installation-host-probe.mjs /private/tmp/stockinsider-reviewed-host-probe.json
```

The output must not exist; the controller must actually be arm64. The probe refuses otherwise. It does not read auth.

The existing protected live oracle uses the following bounded test entry, with a fresh mode-0700 scratch directory, the exact reviewed checkout, and the operating-system account's existing regular, non-symlink, owner-only `.codex/auth.json`. No environment-token or copied-user-auth substitute is admitted:

```sh
OPPORTUNITY_V3_PROTECTED_HOST_PREFLIGHT_SCRATCH=/private/tmp/REVIEWED-NEW-0700-SCRATCH \
OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH=0 \
OPPORTUNITY_V3_PROTECTED_LIVE_ONLY=1 \
/usr/local/bin/node --test scripts/model-runner-v3/model-runner-v3.test.js
```

This is a manual reproduction of the real permission/network/FD checks and three provider operations, not protected attestation. It must not be run before the independent review/cleanup boundary is resolved. A failed or uncertain process cleanup must retain its resources for investigation. The actual protected entry remains the existing base-owned `protected-external-gate-worker.mjs track --track model_runner` with the real preceding bootstrap artifact; no synthetic bootstrap is supplied.

4. Root alone performs the authorized, audited, one-time tool-PR governance operation and restores normal protection. This report cannot assert a GitHub-native SHA-scoped bypass guarantee.
5. Integrate the reviewed new tool base into application branches, retain their exact independent review/PCR evidence requirements and run every normal protected check. No application is released on these local tool checks.

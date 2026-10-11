# Trusted recovery handoff — 2026-10-11

Classification: unsigned, non-secret, read-only observation summary. This document is not an approval, signed recovery grant, installation authorization, or protected-check result. It records the agent’s actual probes at 2026-10-11T06:03–06:04Z and the immediately preceding GitHub/source inspection. No repeated CI run, provider execution, credential read, installation, main mutation, or ruleset change occurred.

## Evidence provenance and limits

The original probe outputs were returned in this chat’s tool results; no raw probe/log files were saved during that audit. Consequently there are no raw-file paths or hashes to report. This is a measured summary, not a claim that a separately retained raw receipt exists. The report’s own SHA-256 is returned to the parent after writing and is not embedded recursively.

Source inspected: immutable protected main `169aad1b6cfa747f78ae3464b614f43c0749d806`, via the cached repository `/Users/kaerchen/.cache/stockinsider-workspaces/research-integration-oct09`. Its working tree was clean at observation; HEAD was `51a80cbaa1bbe719794ce9ca400532bc48cb1c58`. Root’s installer worktree was not modified. Native hashes used bounded streaming reads with equal before/after stat records. No native version command was run, so no current CLI version is asserted.

## Current protected review entry point

Actual run: https://github.com/Kaichen9527/stockinsider/actions/runs/38115015921
Requirements job: https://github.com/Kaichen9527/stockinsider/actions/runs/38115015921/job/114398110405
Subject: `bc01c006cba307735ccd50c78841b94242e1c014`.

Bootstrap succeeded. Requirements, architecture, exact-review and root failed; model and product protected code gates were skipped. The requirements log at `2026-10-11T05:31:09.8885270Z` states:

```
fatal: couldn't find remote ref refs/heads/evidence/source-led-opportunity-v3-exact-review-bc01c006cba307735ccd50c78841b94242e1c014
```

A fresh GitHub matching-ref query returned an empty list. Existing graph-bound refs remain:

- requirements-v318-digest: `9e7d913b597c57b3d3d2ebfbc8065df95482785e`.
- architecture-v318-digest: `5f960cd4905996233a08b807f582fed49d4c7395`.

The missing exact ref is a concrete preparable input, separate from host recovery. After the installer and other source changes are frozen at final R, a genuinely completed independent `169aad1…R` review can produce R’s unique direct-child evidence commit, adding exactly these three files under `.loop-engineering/state/changes/source-led-opportunity-engine-v3/`:

1. `exact-commit-review-final.md`.
2. `pcr-fulfillment-record-v1.json`.
3. `runtime-review-attestation.json`.

The protected grammar is in `169aad1:scripts/opportunity-v3/protected-external-gate-worker.mjs:588–677`; PCR validation is in `scripts/opportunity-v3/gate-evidence.mjs`. It binds exact head/tree/range/graph, actual review findings, canonical attestation and 31 PCR fulfillment entries. A scoped code review is not that complete review, and unavailable execution evidence must not be invented. The reviewed evidence commit can then be pushed to `refs/heads/evidence/source-led-opportunity-v3-exact-review-<R>` while retaining R as the PR head. Only after this input changes should another protected run be considered. This report does not create any of those approval artifacts.

## Fresh native identity mismatch

Observed at `2026-10-11T06:03:37.591745+00:00`:

- Protected main’s old path `/Applications/ChatGPT.app/Contents/Resources/codex` does not exist.
- Present native path and realpath: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`.
- SHA-256: `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`.
- Device `16777231`; inode `211775622`; size `246046384`; uid `501`; gid `20`; mode `0100755`.
- `codesign -dv --verbose=4` metadata: identifier `codex`, TeamIdentifier `2DC432GLL2`, CDHash `9968cf1ea4020a7730965d776bd02cdc2ce4544d`; Developer ID Application OpenAI OpCo, LLC, Developer ID Certification Authority, Apple Root CA.
- `codesign --verify --strict` on that native file returned exit 0. This is not a Gatekeeper, whole-app, runtime permission, authentication or live-oracle result.

Other measured executables:

| Path | SHA-256 | device / inode |
| --- | --- | --- |
| `/usr/local/bin/node` | `c583851fc85e4618b2374cda13399d59d373ad7cebfc4b55160820b88dcce67b` | `16777231 / 1802834` |
| `/usr/bin/git` | `b8763cf250e607a778bb4603cecb5b90338814d0a3dfcba0d57b1de242f610e9` | `16777231 / 1152921500312571562` |

Node/Git hashes retain the historical values but device identities changed. The present native also differs from the October 8 `cb4e499…` subject. Do not label it version 0.162 based on that older observation, reuse old packets, replace binaries, or relax pin checks.

## Protected registry and successor boundary

Protected main remains `169aad1b6cfa747f78ae3464b614f43c0749d806`. Its runner listing and bc01c006’s listing both hash to:

`fafab4f391e8bc077a0e2ec7ed10d1f4afc02bfbc77006ccdb436640e5e77161`.

The immutable main worker’s `modelOracleSuccessorApprovals` has no outgoing approval from that listing. It contains historical one-time transitions ending at V3.18. Candidate changes cannot replace the worker checked out from the protected pull-request base.

The tracked registry path is `.loop-engineering/state/changes/source-led-opportunity-engine-v3/external-gate-release-registry-v1.json`. It registers bootstrap `scripts/opportunity-v3/protected-gate-root.mjs`, release `stockinsider-v3-gate-root-v1`, SHA-256 `0efdb5f213ade24716d33a49ace1b57b05c1da171289cc930225df718c340f91`. It is a bootstrap source registry, not an established recovery owner/reviewer key registry.

Protected workflow `324989200` remains `.github/workflows/source-led-opportunity-external-gate.yml`, driven by `pull_request_target`. The bounded authenticated workflow list and empty repository Actions-variable list did not expose a recovery ingress. This does not prove no undocumented off-host authority exists.

Ruleset `20177392` is active, with no bypass actors and `current_user_can_bypass: never`. It requires `stockinsider-v3-gate-root` from GitHub Actions integration `15368`. The authenticated repository account has admin/maintain/push/pull/triage permissions; that does not create a recovery signature or authorized protected installation protocol. Runner `stockinsider-mac-arm64-kaerchen` (id21) was online and idle; online status does not establish pin compatibility.

## Existing installed runtime is a different authority scope

Actual metadata-only directory inspection found:

- `/Users/kaerchen/Library/Application Support/StockInsiderRuntime`: directory0700, uid501/gid20.
- `current`: symlink to `releases/741dbca0edefe71785b53184963e01952b4c2ff9`.
- `releases` and `activation-authority-nonces`: directories0700, uid501/gid20. Nonce contents were not read.
- `bootstrap-authority-nonces`: absent at that exact path; this does not establish anything about alternate configured roots.

The known public installation manifest was opened no-follow/nonblocking as a regular bounded file and only non-secret manifest fields were reported:

`/Users/kaerchen/Library/Application Support/StockInsiderRuntime/releases/741dbca0edefe71785b53184963e01952b4c2ff9/installation-manifest.json`

- mode0600, uid501/gid20.
- File SHA-256 `6978c157bed4e241fb7d15b3fec11b2863f8c18b48c14bf8ea808f765d33549c`.
- Schema `stockinsider-runtime-installation-v1.1`.
- Commit `741dbca0edefe71785b53184963e01952b4c2ff9`; tree `559b31642fa1fb8a66d2e02a25ef058875a712a9`.
- Review-attestation digest `7b66ecba2444bc73ae1945c60373771cf1bebc5fd2cab80f7df93bf30b6f66c5`.
- Worker `scripts/runtime/auth-source-worker-cli.js`, SHA-256 `dd24d4ace309178aa99248a2c14df1b3b59e6dae614d475bd19567a582cb29d0`.
- Config `config/runtime/auth-source-dag.json`, SHA-256 `1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2`.
- InstalledAt `2026-08-29T23:29:12Z`.

This proves an installation manifest exists, not that the installed service is healthy or its whole bundle is verified. Main’s `scripts/runtime/reviewed-runtime-installer-cli.js:208–225` authenticates only `stockinsider-runtime-activation-authority-v2` / `tracked_runtime_activation`, with the non-secret key reference `keychain:stockinsider-runtime:activation-authority-hmac`. No key presence/value was queried. Its authority and nonce ledger cannot be repurposed as protected host-recovery authority or predecessor CAS.

## Smallest actionable owner handoff

Work that can proceed without inventing trust:

1. Finish and freeze the installer/source candidate; perform the real full-range independent review and prepare the exact three-file evidence ref described above.
2. Prepare a separately reviewed native successor against the newly measured bytes and the final parser/lifecycle source. Fresh version/signature/permission evidence remains to be collected in a separately authorized host-specific step. Historical e94d/1d92 packets and the exact1d92 planner remain preserved, inactive and inapplicable to new bytes.
3. Ask the existing recovery operator for public references and protocol material, not secret values: (a) authenticated ingress identity and previously delegated scope permitting protected worker/review-registry/recovered-base installation, (b) existing public owner/reviewer registry and provenance, and (c) durable predecessor CAS plus atomic installation/publication protocol and exact installation targets. Then bind a final exact package and genuine independent evidence under that mechanism before any durable consumption or install.

If no such existing mechanism exists, there is no currently discovered command that legitimately bridges this trust gap. The alternative is a separately proposed and independently reviewed institutional bootstrap change. Its required review surface includes the protected workflow/worker, bootstrap release registry, graph-bound review sources, exact successor listing, predecessor ledger, installation/publication permissions, rollback/failure retention and genuine fresh protected checks. It must identify how an already authorized control plane authenticates and lands that change while preserving the required check. A candidate-only new script, local new key, chat approval, custom success status or use of GitHub admin privileges is not that entry point. No method for landing this new trust contract without an established authority is claimed here.

The immediate practical dependency is therefore an owner-supplied reference to that real authority mechanism, or a separately reviewed establishment procedure with an explicit legitimate trust anchor—not another generic planner and not a repeated failing workflow. Product, installer, VM and independent-review work can continue while this external capability is resolved.

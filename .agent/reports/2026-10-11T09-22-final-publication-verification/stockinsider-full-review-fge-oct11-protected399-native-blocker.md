# Bounded protected399 native blocker audit

Unsigned read-only audit, 2026-10-11. No provider, auth/secret read, native executable, CI rerun, installation, source mutation, pin override, signature, status injection or ruleset change was performed. This report distinguishes verified repository behavior from an external mechanism that has not been established.

## Actual new failure

Run38128096991, model job114436645777, exact subject399e9bdebfdd05b7b2f8caf5efd879ff728ad9fd. At2026-10-11T09:23:10.8816340Z:

`protected external gate worker failed: spawnSync /Applications/ChatGPT.app/Contents/Resources/codex ENOENT`

Saved raw `/tmp/stockinsider-protected399-model-runner-failure-oct11.log`:20,033bytes, SHA256 `2b8c7861da63ecc49f27e27302ccde6101b3d8de3d689ef3427d3d176d229cc9`.

The log shows successful detached subject preparation and then actual `track --track model_runner`. Root reports the real requirements, architecture and exact-review jobs succeeded. This is no longer a missing exact-review-ref problem. Product track was still running at audit admission; this report makes no product-track conclusion.

## Exact first blocked boundary

Trusted base main remains `169aad1b6cfa747f78ae3464b614f43c0749d806`, confirmed by authenticated GitHub ref read. In its `scripts/opportunity-v3/protected-external-gate-worker.mjs`:

-737–746 read the pin from the **base tree**; candidate pin files/environment do not choose the executable.
-781–807 `candidateSandbox` uses that fixture's absolute Codex path.
-1110–1116 invoke that sandbox for the first root dependency `npm ci --ignore-scripts`.
-1151 onward executes acceptance/model tests and disabled doctor;1172 invokes the trusted live/reused oracle.

Thus the missing Codex binary prevents even the first sandboxed dependency preparation, before the model tests, host oracle or actual provider authentication. This log does not show a model response failure, parser failure, missing API key or failed live-oracle attempt. The fixed fixture is v3.18, Codex `codex-cli0.155.0-alpha.16.3`, old path above, SHA256 `c67698d0990aae05211d9c43ab343ad9517e406824dea77eca103a2806232b3a`; it additionally binds realpath/stat/signature/bundle identity. Pointing to a different binary or recreating an alias is not an accepted repair.

Earlier measured host facts are retained in `/tmp/stockinsider-trusted-recovery-oct11.md`, SHA256 `d5d47f38df5aae83290a08e382f01d6a74ac7f60c8500c84c933a14b4b64c449`. At06:03–06:04Z it found the old path absent and the signed native at `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`, SHA256 `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`. That observation is timestamped history, not a new version/hash probe; no current version is inferred.

## Existing alternate paths do not resolve this failure

The immutable worker's838–855 one-time successor map ends by approving v3.18. There is no outgoing entry for current listing `fafab4f391e8bc077a0e2ec7ed10d1f4afc02bfbc77006ccdb436640e5e77161`. Fresh Git recomputation shows main and399 share exactly that listing.884–891 permits only identical listing or one exact pre-approved successor; there is no owner-grant file, admin flag, automatic path discovery or recovery-signature handler in that code.

The existing `.github/protected-model-oracle-reuse-v1.json` is also base-owned. It names source4e1a658d0f97a32010ba0ae1e9a9eac29b617a05, artifact9280965835 and expiry2026-11-15T08:04:30Z. Its source listing recomputes to `385ffd25abbd44a56b341eec35db2acea3985432e341874a69c71e07e31c0878`, different from current main/399. The exact-listing predicate at1005–1007 therefore cannot reuse it for399. Moreover reuse is reached only after the missing-binary sandbox steps. No artifact download or redundant old-run query was needed to establish either fact.

The existing external-gate release registry registers bootstrap `stockinsider-v3-gate-root-v1` at `scripts/opportunity-v3/protected-gate-root.mjs`, SHA256 `0efdb5f213ade24716d33a49ace1b57b05c1da171289cc930225df718c340f91`. This is not an implemented post-invalidation host recovery ingress. The earlier bounded audit found only the pull_request_target protected workflow and no exposed authenticated recovery entry. It did not establish that an undocumented external institutional mechanism cannot exist.

## Reusable work, not installed authority

Fresh authenticated PR metadata confirms all remain OPEN/DRAFT:

|PR|Exact head|Reusable scope / limitation|
|---|---|---|
|288|e94d21f9fe05dc436211a2458ea59adb52195e26|Recovery protocol and Sol6.1/Astra routing; old exact native facts, inactive.|
|295|73e0aed1b6303c0fc4470b85d751717d225d0fa4|Inactive installer proposal; requires actual external deployment contract.|
|311|1d92e04e26c393c6d9c32b549854281e3f29f115|October8 native successor; not the October11 native identity.|
|314|b1d96eb96156d3e1394615bb32c7a2d7ef90b661|Exact1d92 installation planner; cannot be relabeled for current native.|
|317|1afdd69bcc3bedbeae4151a56a7b372f64b3a58f|Independent strict parser successor and tests; source reusable subject to new exact review.|
|318|0825db4f5cb563d7760f8e4b0e087a9c9d4bf8e7|Independent lifecycle/recovery-fence successor and tests; source reusable subject to new exact review.|

None authorizes its own installation into the protected base. For example318 listing is `d8d86b6bdd728150d89f9f4e95a2f9a4a89b8fd108e586bf5989fcc24496bc94`, not an outgoing approved successor of current main. No PR is claimed freshly compatible with the current native executable.

## Smallest real external dependency

No implemented callable recovery ingress in the inspected trusted base can repair this missing executable while preserving the existing required check. More candidate code, another unsigned review record, a private signing key by itself, GitHub admin status, or a synthetic successful status does not add that missing capability: the trusted worker has no consumer for such a grant.

The owner must provide one **actual already-authorized recovery mechanism with provenance**, either:

1. A verified, established whole-host recovery procedure that can restore the original reviewed execution environment with all exact fixture identities and its existing authorization intact. No such restorable environment/image has been shown; this is a conditional external possibility, not permission to substitute a binary or forge stat identity.
2. An existing authenticated institutional control-plane entry capable of installing a reviewed protected-base/bootstrap transition after the old host is unavailable, without suppressing its required check. It must identify the current trusted authority, exact predecessor169/listingfafab4, allowed worker/pin/graph-registry targets, atomic predecessor consumption/installation and rollback/failure retention. It must enable a genuinely reviewed successor and fresh protected checks. If such an entry does not exist, its establishment is a separate governance/bootstrap change requiring a legitimate external trust anchor; no command for landing it through the currently broken check is available in this repository.

The immediate request is therefore a concrete entry point/procedure and its pre-existing delegation proof—not secret values and not another generic planner. Once supplied, the reviewed parser/lifecycle and recovery proposal can be reused to prepare one exact fresh native successor under that mechanism. Fresh signature/version/permission facts, final listing and genuine independent evidence must bind that successor; historical packets cannot be reused as authority.

The existing successful exact-review evidence remains valid for399's source. The truthful unsigned ten-key review attestation and protected runner recovery are separate boundaries. Independent product/installer/deployment preparation can continue; merge/deploy cannot be represented as gated success while this required model track fails. Do not rerun the same protected job until the actual host/control-plane prerequisite changes.

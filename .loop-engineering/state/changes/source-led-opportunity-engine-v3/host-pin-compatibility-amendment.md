# Model Runner Host-Pin Compatibility Amendment

Amendment version: `model-runner-host-pin-amendment-v3.16`

Status: active

V3.16 records the root-volume device identity observed on 2026-09-11 after the
approved runner host changed from device `16777233` to `16777232`. Every pinned
inode, size, owner, mode, executable hash, version and CodeDirectory identity is
unchanged and re-observed rather than inferred. No broader device, version or path
is admitted.

## Decision

The repository-owned `model_runner_v3` host oracle is compatible with the
currently installed Codex `0.153.4` line only through the exact observed
build string `codex-cli 0.153.4`. This is an exact pin, not a
semver/range allowance: another alpha build, patch-suffixed build, or any later
binary is rejected until a new compatibility amendment and fixture are
reviewed.

The active immutable fixture remains
`model-runner-host-pins-v3.json`, version
`model-runner-host-pins-v3.16`. Its canonical pre-LF payload is exactly 2,132
UTF-8 bytes with SHA-256
`25e485f32668470f002dedc89425ddb5370dacf1a8a22a8ed0ac3fd3602c7f02`;
the tracked LF-terminated file is exactly 2,133 bytes.

## Verified host identity

The compatibility evidence observed on the approved macOS arm64 host is:

- lexical and real executable path:
  `/Applications/ChatGPT.app/Contents/Resources/codex`
- version: `codex-cli 0.153.4`
- executable SHA-256:
  `a30ec314bbd0e3721632234d07db7c99855db3b9f1e32dbe8c791947f07e7629`
- stat identity: device `16777232`, inode `152896624`, size `220585024`,
  uid `501`, gid `20`, mode `100755`
- signing identifier: `codex`
- signing Team ID: `2DC432GLL2`
- full CodeDirectory SHA-256:
  `864aa1693ffed7034fd3d1a723386b250aa1627d4b244a0b08da440578827463`
- bundle assessment: `Notarized Developer ID`

The refreshed ChatGPT bundle, Node and Git stat identities are also exact fixture
members: bundle device/inode `16777232/152895446`, Node `16777232/1802834`, Git
`16777232/1152921500312571585`; the bundle CodeDirectory SHA-256 is
`e2f41d8f6362b87345d4e5a9336d0dc36ec199fe6a276edcab4209e1c0db944d`.
The runner and doctor must call the same host preflight and verify every fixture member
and the static runner identity before granting model authority. They may not learn a
replacement value from the executable under test or fall back to a different executable.

## Compatibility boundary

This amendment changes only the compatible host identity. It does not change
the runner protocol, routing, approval policy, sandbox permissions, journal
state machine, trusted Git apply boundary, proposal authority, product
scoring, evaluation governance, deployment authority, or production mutation
boundary. `model_runner_v3` remains an independent verification track with
`influence: none`.

Any observable path, stat, digest, version, signing, designated-requirement,
Team-ID, CodeDirectory or notarization mismatch is fail-closed. A ChatGPT or
Codex update therefore blocks the runner until another explicit amendment is
created and reviewed.

## One-time protected rotation

The successor values above were measured independently with `stat`, SHA-256,
`codesign --verify --deep --strict`, designated requirement, Team ID and
`spctl -a -vv`. They are not learned by the candidate test. Before this fixture
may be accepted in a PR, a protected-base owner must add this exact fixture
digest and metadata digest to the base-owned successor approval record, then
run the protected model-runner gate. The candidate supplies only a byte-exact
fixture that the already-reviewed protected base compares against that record;
it cannot add or alter its own approval. The approval is single-use for the
old-to-new digest pair and any subsequent binary drift fails closed.

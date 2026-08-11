# Model Runner Host-Pin Compatibility Amendment

Amendment version: `model-runner-host-pin-amendment-v3.8`

Status: active

V3.8 records the host filesystem device identity observed after the workspace host
remount (`16777233`). Executable bytes, versions, inodes, sizes and Apple signing
identities are byte-identical to V3.7; no broader version or path is admitted.

## Decision

The repository-owned `model_runner_v3` host oracle is compatible with the
currently installed Codex `0.147.0-alpha.6` line only through the exact observed
build string `codex-cli 0.147.0-alpha.6.5`. This is an exact pin, not a
semver/range allowance: `0.147.0-alpha.6`, another `.6.x` build, or any later
binary is rejected until a new compatibility amendment and fixture are
reviewed.

The active immutable fixture remains
`model-runner-host-pins-v3.json`, version
`model-runner-host-pins-v3.8`. Its RFC-8785 pre-LF payload is exactly 2,137
UTF-8 bytes with SHA-256
`e7ce9c035f2af2de47e180bbaa50ff1a914c7098afc43112edf951a9162611d4`;
the tracked LF-terminated file is exactly 2,138 bytes.

## Verified host identity

The compatibility evidence observed on the approved macOS arm64 host is:

- lexical and real executable path:
  `/Applications/ChatGPT.app/Contents/Resources/codex`
- version: `codex-cli 0.147.0-alpha.6.5`
- executable SHA-256:
  `e4432c0c085e4a2e5b9cf982e4dd2ebdb44ed33c422827b6e6c64353778e773b`
- stat identity: device `16777233`, inode `85815129`, size `218437552`,
  uid `501`, gid `20`, mode `100755`
- signing identifier: `codex`
- signing Team ID: `2DC432GLL2`
- full CodeDirectory SHA-256:
  `ab3668dac6034ce5b232f45a9a74b92978b49b74e51f63cc7f4b6882a8fc283a`
- bundle assessment: `Notarized Developer ID`

The refreshed ChatGPT bundle, Node and Git stat identities are also exact fixture
members: bundle device/inode `16777233/85813953`, Node `16777233/1802834`, Git
`16777233/1152921500312571585`; the bundle CodeDirectory SHA-256 is
`371c120f2de0846e32cee64895becd69461bc15d2db3d99b52e9b9d4bfcadfaf`.
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

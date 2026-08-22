# Model Runner Host-Pin Compatibility Amendment

Amendment version: `model-runner-host-pin-amendment-v3.11`

Status: active

V3.11 records the exact signed ChatGPT/Codex update observed on 2026-08-22. Node
and Apple Git remain unchanged; the Codex executable and bundle inode, hash and
CodeDirectory identities are re-observed rather than inferred. No broader version
or path is admitted.

## Decision

The repository-owned `model_runner_v3` host oracle is compatible with the
currently installed Codex `0.149.0-alpha.4` line only through the exact observed
build string `codex-cli 0.149.0-alpha.4`. This is an exact pin, not a
semver/range allowance: another alpha build, patch-suffixed build, or any later
binary is rejected until a new compatibility amendment and fixture are
reviewed.

The active immutable fixture remains
`model-runner-host-pins-v3.json`, version
`model-runner-host-pins-v3.11`. Its RFC-8785 pre-LF payload is exactly 2,140
UTF-8 bytes with SHA-256
`86ca1054b4e3e131ee9db618ec7280257cf9d6deeeb677e9a29f113771386264`;
the tracked LF-terminated file is exactly 2,141 bytes.

## Verified host identity

The compatibility evidence observed on the approved macOS arm64 host is:

- lexical and real executable path:
  `/Applications/ChatGPT.app/Contents/Resources/codex`
- version: `codex-cli 0.149.0-alpha.4`
- executable SHA-256:
  `10afbeddd6f951635d8fcfbb337034d37934bb3495c16d053b3560d75747619b`
- stat identity: device `16777233`, inode `123954731`, size `220603584`,
  uid `501`, gid `20`, mode `100755`
- signing identifier: `codex`
- signing Team ID: `2DC432GLL2`
- full CodeDirectory SHA-256:
  `9079c5b70ea6b21614c34b15db89aa402adcdc79d2817aa82e612d6672267cdc`
- bundle assessment: `Notarized Developer ID`

The refreshed ChatGPT bundle, Node and Git stat identities are also exact fixture
members: bundle device/inode `16777233/123953536`, Node `16777233/1802834`, Git
`16777233/1152921500312571585`; the bundle CodeDirectory SHA-256 is
`38611f3ab7750b1422775c93d5219a9c247a7d13b53a12efbff4d839a2f5d800`.
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

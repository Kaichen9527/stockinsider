# Model Runner Host-Pin Compatibility Amendment

Amendment version: `model-runner-host-pin-amendment-v3.14`

Status: active

V3.14 records the exact signed ChatGPT/Codex update observed on 2026-09-02. Node
and Apple Git remain unchanged; the Codex executable and bundle inode, hash and
CodeDirectory identities are re-observed rather than inferred. No broader version
or path is admitted.

## Decision

The repository-owned `model_runner_v3` host oracle is compatible with the
currently installed Codex `0.151.0-alpha.7.2` line only through the exact observed
build string `codex-cli 0.151.0-alpha.7.2`. This is an exact pin, not a
semver/range allowance: another alpha build, patch-suffixed build, or any later
binary is rejected until a new compatibility amendment and fixture are
reviewed.

The active immutable fixture remains
`model-runner-host-pins-v3.json`, version
`model-runner-host-pins-v3.14`. Its RFC-8785 pre-LF payload is exactly 2,142
UTF-8 bytes with SHA-256
`bfa364974e14fb4b326d171be8db9d0ad09b7f9a9d698119d81ac5d553afbe9d`;
the tracked LF-terminated file is exactly 2,143 bytes.

## Verified host identity

The compatibility evidence observed on the approved macOS arm64 host is:

- lexical and real executable path:
  `/Applications/ChatGPT.app/Contents/Resources/codex`
- version: `codex-cli 0.151.0-alpha.7.2`
- executable SHA-256:
  `a6042937174f72112dbd2d554a4af36936422e0c5ac69e353dc68994458996e9`
- stat identity: device `16777233`, inode `145748315`, size `231697328`,
  uid `501`, gid `80`, mode `100755`
- signing identifier: `codex`
- signing Team ID: `2DC432GLL2`
- full CodeDirectory SHA-256:
  `d697b229e842cd9e7809eeaa182d69f1cb0b4d64fe5c183365b13a0573032f74`
- bundle assessment: `Notarized Developer ID`

The refreshed ChatGPT bundle, Node and Git stat identities are also exact fixture
members: bundle device/inode `16777233/145747128`, Node `16777233/1802834`, Git
`16777233/1152921500312571585`; the bundle CodeDirectory SHA-256 is
`230d7f7879e2c62f4251e278fbea95844471c1d5df132161d8c2137a7b9991de`.
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

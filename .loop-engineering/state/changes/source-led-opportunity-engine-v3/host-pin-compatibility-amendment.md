# Model Runner Host-Pin Compatibility Amendment

Amendment version: `model-runner-host-pin-amendment-v3.6`

Status: active

## Decision

The repository-owned `model_runner_v3` host oracle is compatible with the
currently installed Codex `0.147.0-alpha.1` line only through the exact observed
build string `codex-cli 0.147.0-alpha.1.2`. This is an exact pin, not a
semver/range allowance: `0.147.0-alpha.1`, another `.1.x` build, or any later
binary is rejected until a new compatibility amendment and fixture are
reviewed.

The active immutable fixture remains
`model-runner-host-pins-v3.json`, version
`model-runner-host-pins-v3.6`. Its RFC-8785 pre-LF payload is exactly 2,137
UTF-8 bytes with SHA-256
`3827556c3dbef5fdd342d1272845810ec0c9f57f7940200a1beff2bb22301049`;
the tracked LF-terminated file is exactly 2,138 bytes.

## Verified host identity

The compatibility evidence observed on the approved macOS arm64 host is:

- lexical and real executable path:
  `/Applications/ChatGPT.app/Contents/Resources/codex`
- version: `codex-cli 0.147.0-alpha.1.2`
- executable SHA-256:
  `9f6748b4ab10ffc92c28b9ccedae89e61a302bbc011df7d276ee38f55906e481`
- stat identity: device `16777234`, inode `83444490`, size `275653216`,
  uid `501`, gid `20`, mode `100755`
- signing identifier: `codex`
- signing Team ID: `2DC432GLL2`
- full CodeDirectory SHA-256:
  `e0b83937bfb53f8058364344725d47d8e159da99ec92143be07953d2ad0ee6f5`
- bundle assessment: `Notarized Developer ID`

The refreshed ChatGPT bundle, Node and Git stat identities are also exact fixture
members: bundle device/inode `16777234/83443324`, Node `16777234/1802834`, Git
`16777234/1152921500312571585`; the bundle CodeDirectory SHA-256 is
`31988e4baf66f1817b3445fa47809ea75b0189639dd392197831370d277cf8d6`.
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

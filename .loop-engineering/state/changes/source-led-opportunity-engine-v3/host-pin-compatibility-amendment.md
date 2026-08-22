# Model Runner Host-Pin Compatibility Amendment

Amendment version: `model-runner-host-pin-amendment-v3.12`

Status: active

V3.12 records the exact signed ChatGPT/Codex update observed on 2026-08-22. Node
and Apple Git remain unchanged; the Codex executable and bundle inode, hash and
CodeDirectory identities are re-observed rather than inferred. No broader version
or path is admitted.

## Decision

The repository-owned `model_runner_v3` host oracle is compatible with the
currently installed Codex `0.149.0-alpha.4.1` line only through the exact observed
build string `codex-cli 0.149.0-alpha.4.1`. This is an exact pin, not a
semver/range allowance: another alpha build, patch-suffixed build, or any later
binary is rejected until a new compatibility amendment and fixture are
reviewed.

The active immutable fixture remains
`model-runner-host-pins-v3.json`, version
`model-runner-host-pins-v3.12`. Its RFC-8785 pre-LF payload is exactly 2,144
UTF-8 bytes with SHA-256
`c09b9fdb863cff18e3d5c97773faaf52ea37787b66c96e094d13ceaddf4bca38`;
the tracked LF-terminated file is exactly 2,145 bytes.

## Verified host identity

The compatibility evidence observed on the approved macOS arm64 host is:

- lexical and real executable path:
  `/Applications/ChatGPT.app/Contents/Resources/codex`
- version: `codex-cli 0.149.0-alpha.4.1`
- executable SHA-256:
  `09db9560f6f9dec139d3324254fb3c8fdbad5ecce1d8c794113dc15294f6aefd`
- stat identity: device `16777233`, inode `124633758`, size `220521008`,
  uid `501`, gid `20`, mode `100755`
- signing identifier: `codex`
- signing Team ID: `2DC432GLL2`
- full CodeDirectory SHA-256:
  `a6ac9c9726c6f23545c763df8ee55584c4dbe5abbb1bd272130b3f321329da11`
- bundle assessment: `Notarized Developer ID`

The refreshed ChatGPT bundle, Node and Git stat identities are also exact fixture
members: bundle device/inode `16777233/124632619`, Node `16777233/1802834`, Git
`16777233/1152921500312571585`; the bundle CodeDirectory SHA-256 is
`59729f374e9041c73fae77d3fb33ce323d514ba48efaf78129ed94c1f240492f`.
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

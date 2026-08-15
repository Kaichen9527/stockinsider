# Model Runner Host-Pin Compatibility Amendment

Amendment version: `model-runner-host-pin-amendment-v3.9`

Status: active

V3.9 records the exact signed ChatGPT/Codex update observed on 2026-08-15. Node,
Apple Git and the filesystem device identity remain unchanged; no broader version
or path is admitted.

## Decision

The repository-owned `model_runner_v3` host oracle is compatible with the
currently installed Codex `0.148.0-alpha.9` line only through the exact observed
build string `codex-cli 0.148.0-alpha.9`. This is an exact pin, not a
semver/range allowance: `0.148.0-alpha.9.1`, another alpha build, or any later
binary is rejected until a new compatibility amendment and fixture are
reviewed.

The active immutable fixture remains
`model-runner-host-pins-v3.json`, version
`model-runner-host-pins-v3.9`. Its RFC-8785 pre-LF payload is exactly 2,137
UTF-8 bytes with SHA-256
`0982f6abe1d9a60697186c11c2fbada42e437a92c276accf47413e40ae22ddba`;
the tracked LF-terminated file is exactly 2,138 bytes.

## Verified host identity

The compatibility evidence observed on the approved macOS arm64 host is:

- lexical and real executable path:
  `/Applications/ChatGPT.app/Contents/Resources/codex`
- version: `codex-cli 0.148.0-alpha.9`
- executable SHA-256:
  `7a26b07855ef91194c8d1bf58d15970878ee11458253df328d38fec0c87ec192`
- stat identity: device `16777233`, inode `111722509`, size `219666000`,
  uid `501`, gid `20`, mode `100755`
- signing identifier: `codex`
- signing Team ID: `2DC432GLL2`
- full CodeDirectory SHA-256:
  `3028ec5e1ecd263a3fd9969d7cca52f7686d9cc5d1964a2cf7de3bb1037c1657`
- bundle assessment: `Notarized Developer ID`

The refreshed ChatGPT bundle, Node and Git stat identities are also exact fixture
members: bundle device/inode `16777233/111721334`, Node `16777233/1802834`, Git
`16777233/1152921500312571585`; the bundle CodeDirectory SHA-256 is
`fba50d1dd5eae8ad91731435fcc9e1f3e2b3b89bdfea2d0cfbeb3c90445e7729`.
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

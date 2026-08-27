# Model Runner Host-Pin Compatibility Amendment

Amendment version: `model-runner-host-pin-amendment-v3.13`

Status: active

V3.13 records the exact signed ChatGPT/Codex update observed on 2026-08-27. Node
and Apple Git remain unchanged; the Codex executable and bundle inode, hash and
CodeDirectory identities are re-observed rather than inferred. No broader version
or path is admitted.

## Decision

The repository-owned `model_runner_v3` host oracle is compatible with the
currently installed Codex `0.150.0-alpha.8` line only through the exact observed
build string `codex-cli 0.150.0-alpha.8`. This is an exact pin, not a
semver/range allowance: another alpha build, patch-suffixed build, or any later
binary is rejected until a new compatibility amendment and fixture are
reviewed.

The active immutable fixture remains
`model-runner-host-pins-v3.json`, version
`model-runner-host-pins-v3.13`. Its RFC-8785 pre-LF payload is exactly 2,140
UTF-8 bytes with SHA-256
`23de0561f8714d5177ff77dd40c1325e06bedaade8a420acf3b0dded992ea5b8`;
the tracked LF-terminated file is exactly 2,141 bytes.

## Verified host identity

The compatibility evidence observed on the approved macOS arm64 host is:

- lexical and real executable path:
  `/Applications/ChatGPT.app/Contents/Resources/codex`
- version: `codex-cli 0.150.0-alpha.8`
- executable SHA-256:
  `4ff5e75f028e913cfeb53bd7319f87573cdce6538c1b1ccc44ce62d5ce51ca1d`
- stat identity: device `16777233`, inode `130020863`, size `227508304`,
  uid `501`, gid `20`, mode `100755`
- signing identifier: `codex`
- signing Team ID: `2DC432GLL2`
- full CodeDirectory SHA-256:
  `33f71aee6d3f281e0a63630b6f7d41659834e2607c84864eadbc825196cb2f15`
- bundle assessment: `Notarized Developer ID`

The refreshed ChatGPT bundle, Node and Git stat identities are also exact fixture
members: bundle device/inode `16777233/130019724`, Node `16777233/1802834`, Git
`16777233/1152921500312571585`; the bundle CodeDirectory SHA-256 is
`3c699dddd49c4c4845b91c63d77efbcde48a5cf940f19ba3cce021618a7da213`.
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

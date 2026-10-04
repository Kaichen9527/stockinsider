# Model Runner Host-Pin Compatibility Amendment

Amendment version: `model-runner-host-pin-amendment-v3.18`

Status: active

V3.18 records the signed ChatGPT/Codex application update and macOS root-volume
identity observed on 2026-09-24. Every path, stat identity, executable digest,
version and CodeDirectory identity is measured rather than inferred. No broader
device, version or path is admitted.

## Decision

The repository-owned `model_runner_v3` host oracle is compatible with the
currently installed Codex line only through the exact observed build string
`codex-cli 0.155.0-alpha.16.3`. This is an exact pin, not a
semver/range allowance: another alpha build, patch-suffixed build, or any later
binary is rejected until a new compatibility amendment and fixture are
reviewed.

The active immutable fixture remains
`model-runner-host-pins-v3.json`, version
`model-runner-host-pins-v3.18`. Its canonical pre-LF payload is exactly 2,143
UTF-8 bytes with SHA-256
`4e3a508b5120903ec7364771ba1aea8b98bd43e1d58f0ed1fcee1faaf8457008`;
the tracked LF-terminated file is exactly 2,144 bytes.

## Verified host identity

The compatibility evidence observed on the approved macOS arm64 host is:

- lexical and real executable path:
  `/Applications/ChatGPT.app/Contents/Resources/codex`
- version: `codex-cli 0.155.0-alpha.16.3`
- executable SHA-256:
  `c67698d0990aae05211d9c43ab343ad9517e406824dea77eca103a2806232b3a`
- stat identity: device `16777234`, inode `187722471`, size `235548432`,
  uid `501`, gid `20`, mode `100755`
- signing identifier: `codex`
- signing Team ID: `2DC432GLL2`
- full CodeDirectory SHA-256:
  `ca7400ca48cc1ce76ba1cbaf002760d0017ef413c971ea21b6d6e3df52bed075`
- bundle assessment: `Notarized Developer ID`

The refreshed ChatGPT bundle, Node and Git stat identities are also exact fixture
members: bundle device/inode `16777234/187721324`, Node `16777234/1802834`, Git
`16777234/1152921500312571562`; the bundle CodeDirectory SHA-256 is
`53d8ceac529c5ab21133d0b086b4c01e9833155c1a382032a3967feb48d2f303`.
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
may be accepted in a PR, a protected-base owner must approve the exact trimmed
Git model-oracle listing transition from predecessor SHA-256
`5eb11a767efdce7e9faf197b2a98d9450f555fcba9363155fd3b71b7c653adc6` to successor
SHA-256 `fafab4f391e8bc077a0e2ec7ed10d1f4afc02bfbc77006ccdb436640e5e77161`
and bind that successor listing to `model-runner-host-pins-v3.18`. The candidate
supplies only byte-exact model-oracle files that the already-reviewed protected
base compares against that record; it cannot add or alter its own approval. The
approval is single-use for this old-to-new listing pair. The protected listing
map remains closed, so any later, unapproved listing or binary drift fails
closed.

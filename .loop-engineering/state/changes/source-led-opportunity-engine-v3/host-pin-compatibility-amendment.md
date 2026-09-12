# Model Runner Host-Pin Compatibility Amendment

Amendment version: `model-runner-host-pin-amendment-v3.17`

Status: active

V3.17 records the signed ChatGPT/Codex application update and macOS root-volume
identity observed on 2026-09-12. Every path, stat identity, executable digest,
version and CodeDirectory identity is measured rather than inferred. No broader
device, version or path is admitted.

## Decision

The repository-owned `model_runner_v3` host oracle is compatible with the
currently installed Codex line only through the exact observed build string
`codex-cli 0.154.0-alpha.6.2`. This is an exact pin, not a
semver/range allowance: another alpha build, patch-suffixed build, or any later
binary is rejected until a new compatibility amendment and fixture are
reviewed.

The active immutable fixture remains
`model-runner-host-pins-v3.json`, version
`model-runner-host-pins-v3.17`. Its canonical pre-LF payload is exactly 2,142
UTF-8 bytes with SHA-256
`723e35a7095d1948e78fc31a26a70e77964a1f8e8611268c80eda2b1e8be1417`;
the tracked LF-terminated file is exactly 2,143 bytes.

## Verified host identity

The compatibility evidence observed on the approved macOS arm64 host is:

- lexical and real executable path:
  `/Applications/ChatGPT.app/Contents/Resources/codex`
- version: `codex-cli 0.154.0-alpha.6.2`
- executable SHA-256:
  `ecad78dbf98adb89ec475edac86630406cbe59d9f3070b17d88065f136b94bcb`
- stat identity: device `16777234`, inode `166216766`, size `222786528`,
  uid `501`, gid `20`, mode `100755`
- signing identifier: `codex`
- signing Team ID: `2DC432GLL2`
- full CodeDirectory SHA-256:
  `328d6fff18136f9a45750d30e793622de20a84b1bbc4a025306bc2a1f6aca369`
- bundle assessment: `Notarized Developer ID`

The refreshed ChatGPT bundle, Node and Git stat identities are also exact fixture
members: bundle device/inode `16777234/166215464`, Node `16777234/1802834`, Git
`16777234/1152921500312571562`; the bundle CodeDirectory SHA-256 is
`66d1d185c8870f38e19fb698b031fe9d9ba2afb74217b30f5fbaf715a788f43c`.
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
`70dbbd6ed3846ada9804c029321dcc5e97de60ddf4e63a75142d10f2efdde115` to successor
SHA-256 `cc353b697924dbdb5a8cf2944b4f46f1928c5645cb384bd398f5725eea99abc6`
and bind that successor listing to `model-runner-host-pins-v3.17`. The candidate
supplies only byte-exact model-oracle files that the already-reviewed protected
base compares against that record; it cannot add or alter its own approval. The
approval is single-use for this old-to-new listing pair. The protected listing
map remains closed, so any later, unapproved listing or binary drift fails
closed.

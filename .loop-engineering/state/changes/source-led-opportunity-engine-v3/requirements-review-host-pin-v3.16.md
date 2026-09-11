# Fresh Requirements Review — Host Pin v3.16

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

- Final reviewed implementation commit/tree: `aa0c08b9c3fa656e8d127c5e799aee825a4f76dc` / `4db9b3ecb0822f48537e1750d2bdcf84266ad19d`

- Full reviewed range: `991b94c6a906807c18d2375ab2d839297f8e37aa..aa0c08b9c3fa656e8d127c5e799aee825a4f76dc`

- Active graph: `7700f1c0940dae14034c852e5ffe9e8a9f18439834bcc1c744876dc478470159`

## Reviewed requirement

The approved recovery is narrowly defined as:

- Rotate the immutable runner device identity from `16777233` to `16777232`.
- Preserve every inode, size, uid, gid, mode, version, executable hash and signing identity.
- Require a closed predecessor approval and future protected listing mapping.
- Introduce no routing, sandbox, protocol, journal, apply, deployment or production-authority relaxation.

## Previous findings resolved

1. `model-runner-contract.md:160` now correctly states that the active V3.16 amendment supersedes only the V3.15 host identity.

2. `host-pin-compatibility-amendment.md:73–82` now defines the protected transition using the actual trimmed Git model-oracle listing semantics:

- Predecessor V3.15 listing: `cb070b7f1b8acabd4f776e99c773693e96402c9375c2ae317b851138f73b62c5`
- Successor V3.16 listing: `70dbbd6ed3846ada9804c029321dcc5e97de60ddf4e63a75142d10f2efdde115`
- Required future binding: successor listing → `model-runner-host-pins-v3.16`

The approval is explicitly single-use, the listing map remains closed, and the candidate cannot add or alter its own protected approval.

## Scope and consistency evidence

The fixture’s structural difference from the predecessor contains only fixtureVersion and the four device identities (bundle, Codex, Git, Node) from `16777233` to `16777232`. All pinned inode, size, uid, gid, mode, executable SHA-256, version, bundle identity, Team ID, designated requirements and CodeDirectory hashes remain unchanged.

Mechanical identities independently recomputed:
- Active catalog: 6,337 bytes
- Active catalog SHA-256: `1855d103425f4d9086891e2f6bc7eebbb13ae865c1cc96dfef3ea32c4ecd61ca`
- Canonical fixture: 2,132 bytes
- LF-terminated fixture: 2,133 bytes
- Fixture SHA-256: `25e485f32668470f002dedc89425ddb5370dacf1a8a22a8ed0ac3fd3602c7f02`
- Static runner identity: 875 bytes
- Static runner identity SHA-256: `f875e175cd7d84cb0010bddaf16de4badd4968ba81bdb033aecd611b1be00baa`
- Active graph SHA-256: `7700f1c0940dae14034c852e5ffe9e8a9f18439834bcc1c744876dc478470159`

The requirements retain fail-closed behavior for any path, stat, digest, version, signature, Team ID, CodeDirectory or notarization mismatch. No alternate binary, learned value or fallback path is permitted. The amendment explicitly preserves all existing isolation and authority boundaries.

`git diff --check` passed.

## Release boundary

This PASS establishes requirements completeness for the exact subject only. It does not claim that the protected-base successor approval or future listing mapping has already been installed, nor that the protected gate has executed. Those remain mandatory before the V3.16 fixture can receive authority.

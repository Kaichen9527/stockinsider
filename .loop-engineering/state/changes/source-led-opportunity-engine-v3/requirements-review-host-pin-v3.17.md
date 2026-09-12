# Fresh Requirements Review — Host Pin v3.17

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

- Final reviewed implementation commit/tree: `4020588820f41e15dca26792658e97b706174c59` / `9690cd3efebe17660e67994a973bb604128c0e2e`

- Full reviewed range: `7a954378efbdad536007f39975e4ffefe346b7e4..4020588820f41e15dca26792658e97b706174c59`

- Active graph: `9028871acdefa6ecf80931ae98ffc5040a19704a02ec240a590956f2454fc842`

## Reviewed requirement

The approved recovery is narrowly defined as:

- Rotate the immutable signed-host identity to the exact ChatGPT/Codex build observed on 2026-09-12.
- Bind the exact bundle, Codex, Git and Node paths, stat identities, hashes, versions and signing identities.
- Require a closed V3.16 predecessor approval and future V3.17 protected-listing mapping.
- Introduce no routing, sandbox, protocol, journal, apply, deployment or production-authority relaxation.

## Requirement closure

The compatibility amendment records one exact successor rather than a range. The
canonical fixture is 2,142 bytes before its final LF and hashes to
`723e35a7095d1948e78fc31a26a70e77964a1f8e8611268c80eda2b1e8be1417`.
The runner identity is 885 bytes and hashes to
`7d5ee28105dae778b1f35025f38cddaf2aab501db0bfadbaeb2782a911f9fede`.

The measured predecessor and successor model-oracle listings are:

- Predecessor V3.16: `70dbbd6ed3846ada9804c029321dcc5e97de60ddf4e63a75142d10f2efdde115`
- Successor V3.17: `cc353b697924dbdb5a8cf2944b4f46f1928c5645cb384bd398f5725eea99abc6`
- Required future binding: successor listing → `model-runner-host-pins-v3.17`

The approval remains single-use. A candidate cannot add its own protected-base
approval, and any unlisted successor remains fail-closed.

## Scope and consistency evidence

The fixture pins Codex `0.154.0-alpha.6.2`, executable SHA-256
`ecad78dbf98adb89ec475edac86630406cbe59d9f3070b17d88065f136b94bcb`,
full CodeDirectory SHA-256
`328d6fff18136f9a45750d30e793622de20a84b1bbc4a025306bc2a1f6aca369`,
Team ID `2DC432GLL2`, and the notarized Developer ID assessment. It also pins the
current bundle, Git and Node identities. Every mismatch still exits through the
existing routing/preflight failure before model, apply or durable operation work.

Mechanical identities independently recomputed:

- Active catalog: 6,758 bytes
- Active catalog SHA-256: `adbaec4c0c4366823d5ed6f51d4f1355304a27b50eee2e65cad5a2dc5fd2f8b4`
- Canonical fixture: 2,142 bytes
- LF-terminated fixture: 2,143 bytes
- Fixture SHA-256: `723e35a7095d1948e78fc31a26a70e77964a1f8e8611268c80eda2b1e8be1417`
- Static runner identity: 885 bytes
- Static runner identity SHA-256: `7d5ee28105dae778b1f35025f38cddaf2aab501db0bfadbaeb2782a911f9fede`
- Active graph SHA-256: `9028871acdefa6ecf80931ae98ffc5040a19704a02ec240a590956f2454fc842`

`git diff --check` and the 21 focused model-runner tests passed on the measured
host.

## Release boundary

This PASS establishes requirements completeness for the exact subject only. It
does not claim that the protected-base successor approval, evidence publication,
protected gate or production deployment has completed. Those remain mandatory.

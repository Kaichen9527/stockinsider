# Fresh Requirements Review — Host Pin v3.17

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

- Final reviewed implementation commit/tree: `245cf0de896aee056a4ecdf1f36ff188cd89e809` / `bc60d20377639ae95f1dc2c0f7dba9c1684c8ce3`

- Full reviewed range: `7a954378efbdad536007f39975e4ffefe346b7e4..245cf0de896aee056a4ecdf1f36ff188cd89e809`

- Active graph: `dea5f4dee7aadf11435bd95f5f0d8024605e5f298f9a02645aa9352865099b7f`

## Reviewed requirement

The recovery rotates the immutable signed-host identity to the exact
ChatGPT/Codex build observed on 2026-09-12, binds the bundle, Codex, Git and Node
paths, stats, hashes, versions and signing identities, and requires one closed
V3.16-to-V3.17 protected successor. It introduces no routing, sandbox, protocol,
journal, apply, deployment or production-authority relaxation.

## Requirement closure

The compatibility amendment records one exact successor rather than a range.
The canonical fixture is 2,142 bytes before its final LF and hashes to
`723e35a7095d1948e78fc31a26a70e77964a1f8e8611268c80eda2b1e8be1417`.
The runner identity is 885 bytes and hashes to
`7d5ee28105dae778b1f35025f38cddaf2aab501db0bfadbaeb2782a911f9fede`.

The measured predecessor and successor model-oracle listings are:

- Predecessor V3.16: `70dbbd6ed3846ada9804c029321dcc5e97de60ddf4e63a75142d10f2efdde115`
- Successor V3.17: `5eb11a767efdce7e9faf197b2a98d9450f555fcba9363155fd3b71b7c653adc6`
- Required future binding: successor listing → `model-runner-host-pins-v3.17`

The approval is single-use. Candidate bytes cannot add their own protected-base
approval and any unlisted successor remains fail-closed.

## Scope and consistency evidence

The fixture pins Codex `0.154.0-alpha.6.2`, executable SHA-256
`ecad78dbf98adb89ec475edac86630406cbe59d9f3070b17d88065f136b94bcb`,
full CodeDirectory SHA-256
`328d6fff18136f9a45750d30e793622de20a84b1bbc4a025306bc2a1f6aca369`,
Team ID `2DC432GLL2`, and the notarized Developer ID assessment. It also pins the
current bundle, Git and Node identities. Every mismatch still exits before model,
apply or durable operation work.

Mechanical identities independently recomputed:

- Active catalog: 6,758 bytes
- Active catalog SHA-256: `adbaec4c0c4366823d5ed6f51d4f1355304a27b50eee2e65cad5a2dc5fd2f8b4`
- Canonical fixture: 2,142 bytes
- LF-terminated fixture: 2,143 bytes
- Fixture SHA-256: `723e35a7095d1948e78fc31a26a70e77964a1f8e8611268c80eda2b1e8be1417`
- Static runner identity: 885 bytes
- Static runner identity SHA-256: `7d5ee28105dae778b1f35025f38cddaf2aab501db0bfadbaeb2782a911f9fede`
- Active graph SHA-256: `dea5f4dee7aadf11435bd95f5f0d8024605e5f298f9a02645aa9352865099b7f`

`git diff --check` and the 21 focused model-runner tests passed on the measured
host.

## Release boundary

This PASS establishes requirements completeness for the exact subject only. It
does not claim the protected-base approval, protected gate, PR merge or production
deployment has completed. Those remain mandatory.

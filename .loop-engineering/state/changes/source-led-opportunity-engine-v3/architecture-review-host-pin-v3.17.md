# Independent architecture/security review — protected host-pin v3.17

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

Reviewer: isolated architecture/security review of the exact immutable subject

## Exact reviewed identity

- Final reviewed implementation commit/tree: `4020588820f41e15dca26792658e97b706174c59` / `9690cd3efebe17660e67994a973bb604128c0e2e`
- Full reviewed implementation range: `7a954378efbdad536007f39975e4ffefe346b7e4..4020588820f41e15dca26792658e97b706174c59`
- Active graph: `9028871acdefa6ecf80931ae98ffc5040a19704a02ec240a590956f2454fc842`
- Checkout: clean
- `git diff --check`: pass

## Review conclusion

The subject updates only the immutable signed-host compatibility boundary and
the exact contract/test identities that describe it. It does not weaken the
runner sandbox, filesystem or network denial, process cleanup, journal, Git
apply, deployment or production-mutation boundaries.

### Host identity remains exact

The V3.17 fixture binds the current ChatGPT bundle and Codex executable to
device `16777234`, their exact inodes and sizes, the notarized OpenAI Team ID
`2DC432GLL2`, designated requirements and full CodeDirectory hashes. Codex is
exactly `codex-cli 0.154.0-alpha.6.2`; Git and Node retain their explicit version
pins while their measured filesystem identities are updated. The executable and
bundle hashes are not learned at runtime.

Canonical fixture size is 2,142 bytes, tracked size is 2,143 bytes and canonical
SHA-256 is
`723e35a7095d1948e78fc31a26a70e77964a1f8e8611268c80eda2b1e8be1417`.
The 885-byte static runner identity hashes to
`7d5ee28105dae778b1f35025f38cddaf2aab501db0bfadbaeb2782a911f9fede`.
Every path, stat, version, digest, signing or notarization mismatch remains a
pre-execution failure.

### Protected successor sequence is closed

Protected V3.16 listing
`70dbbd6ed3846ada9804c029321dcc5e97de60ddf4e63a75142d10f2efdde115`
may approve only reviewed successor listing
`cc353b697924dbdb5a8cf2944b4f46f1928c5645cb384bd398f5725eea99abc6`,
bound to `model-runner-host-pins-v3.17`. Equality remains protected-base
authority; an altered, repeated or later unapproved transition fails closed.

### Active graph and test consistency

Catalog size is 6,758 bytes with SHA-256
`adbaec4c0c4366823d5ed6f51d4f1355304a27b50eee2e65cad5a2dc5fd2f8b4`;
the resulting active graph is
`9028871acdefa6ecf80931ae98ffc5040a19704a02ec240a590956f2454fc842`.
Contract prose, fixture, static identity, package command, doctor and
traceability expectations all name V3.17 consistently.

## Verification performed

The complete focused model-runner suite passed 21/21, including exact host
preflight, disabled doctor, process-group cleanup, filesystem/network denial and
isolated maker execution. The fixture and listing hashes were independently
recomputed from tracked bytes.

## Boundaries

This PASS approves only exact subject `4020588820f41e15dca26792658e97b706174c59`.
It does not assert protected approval merge, evidence publication, exact-review
evidence, PR merge or production mutation. Those remain fail-closed.

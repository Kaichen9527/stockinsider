# Independent architecture/security review — protected host-pin v3.16

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

Reviewer: independent architecture/security reviewer `/root/host_pin_v316_architecture`

## Exact reviewed identity

- Final reviewed implementation commit/tree: `aa0c08b9c3fa656e8d127c5e799aee825a4f76dc` / `4db9b3ecb0822f48537e1750d2bdcf84266ad19d`
- Full reviewed range: `991b94c6a906807c18d2375ab2d839297f8e37aa..aa0c08b9c3fa656e8d127c5e799aee825a4f76dc`
- Active graph: `7700f1c0940dae14034c852e5ffe9e8a9f18439834bcc1c744876dc478470159`
- Checkout: clean
- `git diff --check`: pass

## Review conclusion

The repaired subject closes both previous P1 findings without weakening the host, runner, sandbox, journal, Git-apply or production-mutation boundaries.

### Host identity remains exact

A structured deep comparison of v3.15 and v3.16 found exactly fixtureVersion plus device identity `16777233`→`16777232` for ChatGPT bundle, Codex, Git and Node. All other paths, realpaths, inode, size, ownership, mode, executable hashes, versions, signing identities, Team ID, designated requirements, CodeDirectory hashes and notarized assessment remain unchanged.

Canonical payload 2,132 bytes; tracked file 2,133 bytes; canonical SHA-256 `25e485f32668470f002dedc89425ddb5370dacf1a8a22a8ed0ac3fd3602c7f02`; runner identity 875 bytes; SHA-256 `f875e175cd7d84cb0010bddaf16de4badd4968ba81bdb033aecd611b1be00baa`. Every mismatch remains fail-closed.

### Protected successor sequence is correct

Protected v3.15 listing `cb070b7f1b8acabd4f776e99c773693e96402c9375c2ae317b851138f73b62c5`; approved v3.16 successor listing `70dbbd6ed3846ada9804c029321dcc5e97de60ddf4e63a75142d10f2efdde115`. Actual protected-worker functions returned host pin `model-runner-host-pins-v3.16` and authority `model-runner-host-pin-amendment-v3.16`. Altered, later or repeated unapproved transitions fail closed; protected approval must land first and candidate cannot self-approve.

### Active graph and contract consistency are repaired

Catalog size 6,337 bytes, SHA-256 `1855d103425f4d9086891e2f6bc7eebbb13ae865c1cc96dfef3ea32c4ecd61ca`; active graph `7700f1c0940dae14034c852e5ffe9e8a9f18439834bcc1c744876dc478470159`. Traceability requires v3.16, catalog oracle uses 1855d103, design/evidence authority tags match, contract states V3.16 supersedes only V3.15. No incorrect old assertion remains.

## Verification performed

Focused host/identity/compatibility 3/3 passed; disabled doctor passed with productionMutationAuthorized:false; protected worker/successor tests 12/12; actual cross-checkout listing, structured fixture comparison and active-graph recomputation passed.

## Boundaries

This PASS approves only exact subject aa0c08b. It does not assert protected approval merge, evidence publication, protected gate completion, exact-review evidence or production mutation. Those remain fail-closed.

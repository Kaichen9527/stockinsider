# Independent exact code/security review — host-pin v3.16 predecessor approval

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Exact reviewed identity

- Final reviewed repair/tree: `7da6af31c0d04dea09ba53773e07d6ebbf1e462c` / `a8ab3d4735a2a2020fc88c71db13dfb6a9ede1ea`
- Full final range: `991b94c6a906807c18d2375ab2d839297f8e37aa..7da6af31c0d04dea09ba53773e07d6ebbf1e462c`
- Active graph: `c74be1cd14439580505e05f2ec5904ea7dc9732ee7a4164c9ec1573691ebe352`

## Verification

- The production-trimmed v3.15 listing recomputes to `cb070b7f1b8acabd4f776e99c773693e96402c9375c2ae317b851138f73b62c5`.
- The actual `aa0c08b9c3fa656e8d127c5e799aee825a4f76dc` successor listing recomputes to `70dbbd6ed3846ada9804c029321dcc5e97de60ddf4e63a75142d10f2efdde115`.
- The previous incorrect raw-byte digest `46d5d750…` is absent.
- The runtime helpers bind the protected listing to `model-runner-host-pins-v3.15`, bind the exact successor to `model-runner-host-pins-v3.16`, and authorize only the reviewed `model-runner-host-pin-amendment-v3.16` transition.
- Altered successor bytes are rejected. A further successor from the v3.16 listing is also rejected because it lacks a new protected-base approval.
- `treeIdentity` independently recomputes the `aa0c08b…` graph as `7700f1c0940dae14034c852e5ffe9e8a9f18439834bcc1c744876dc478470159`.
- The `7700…` graph maps to the `aa0c08b` Requirements and Architecture evidence refs and the closed v3.16 review paths.
- All ten previous graph mappings remain registered; `7700…` is the sole addition.
- Tests now execute the real listing, digest, host-pin, authority, and unknown-successor rejection helpers.

## Test evidence

- Protected worker focused suite: `12 passed, 0 failed, 0 skipped, 0 todo`.
- Gate-evidence suite through the project Node 22/type-stripping runner: `4 passed, 0 failed, 0 skipped, 0 todo`.
- `git diff --check`: passed.
- Final checkout: clean.

This review approves only the exact predecessor-approval repair range above. It does not claim protected runtime evidence or independently approve the `aa0c08b…` implementation’s Requirements or Architecture content.

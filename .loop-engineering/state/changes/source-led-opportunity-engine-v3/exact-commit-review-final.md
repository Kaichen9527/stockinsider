# Independent exact code/security review — host pin v3.16

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

- Final reviewed repair/tree: `4ba3bf1cd06b8b3b503e766f69af95966db10fa9` / `d285c5daa5ad1ee674065bfc297fd4380f0f055f`
- Full final range: `0b132a3898a2eb256084f587de1bf039aa95818e..4ba3bf1cd06b8b3b503e766f69af95966db10fa9`
- Active graph: `7700f1c0940dae14034c852e5ffe9e8a9f18439834bcc1c744876dc478470159`

## Correctness and security verification

- Reviewed from a clean checkout with the exact requested HEAD, tree, base and merge base.
- The host fixture’s only semantic changes are:
  - `fixtureVersion`: v3.15 → v3.16
  - device identity `16777233` → `16777232` for the ChatGPT bundle, Codex, Git and Node.
- Inode, size, UID, GID, mode, executable SHA-256, version and codesign identities remain unchanged.
- Fixture canonical payload is 2,132 bytes; tracked LF-terminated file is 2,133 bytes; SHA-256 is `25e485f32668470f002dedc89425ddb5370dacf1a8a22a8ed0ac3fd3602c7f02`.
- Static model-runner identity is 875 bytes and independently reproduces `f875e175cd7d84cb0010bddaf16de4badd4968ba81bdb033aecd611b1be00baa`.
- The repaired protected-worker test explicitly evaluates:
  - protected v3.15 at commit `0b132a3898a2eb256084f587de1bf039aa95818e`;
  - current v3.16 at HEAD.
- Actual Git listings reproduce:
  - v3.15: `cb070b7f1b8acabd4f776e99c773693e96402c9375c2ae317b851138f73b62c5`
  - v3.16: `70dbbd6ed3846ada9804c029321dcc5e97de60ddf4e63a75142d10f2efdde115`
- The v3.15 → v3.16 transition resolves only through `model-runner-host-pin-amendment-v3.16`.
- Repeated current-listing evaluation resolves as protected base. Altered successor, successor-after-v3.16 and unknown host-pin listings all fail closed.
- Historical catalog-v1 still computes graph `c74be1cd14439580505e05f2ec5904ea7dc9732ee7a4164c9ec1573691ebe352`; the final catalog-v2 candidate computes active graph `7700f1c0940dae14034c852e5ffe9e8a9f18439834bcc1c744876dc478470159`. Unknown catalog schemas reject.
- Carried Requirements and Architecture review files are byte-identical to their immutable evidence refs. Each evidence commit is a direct child of `aa0c08b9c3fa656e8d127c5e799aee825a4f76dc` and adds only its closed review path. The reviewed `aa0c08b9...` tree independently computes the same active graph.
- No credential, authorization, shell-execution, network, filesystem-write or protected-boundary widening was introduced.

## Verification executed

- Protected worker tests: 12/12 passed.
- Gate evidence tests: 4/4 passed.
- Combined focused validation: 16/16 passed.
- Model-runner suite: 21/21 passed, with zero failures, skips or todos.
- Disabled doctor: passed with exact v3.16 host pin; `productionMutationAuthorized=false`.
- `git diff --check`: passed.
- Final worktree: clean.

This review covers the exact code/security range only and does not claim protected runtime or live-model evidence.

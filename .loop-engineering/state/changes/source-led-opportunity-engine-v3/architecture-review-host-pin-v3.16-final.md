# Independent architecture/security review — protected host-pin v3.16 final

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

Reviewer: independent architecture/security reviewer `/root/v316_architecture_review_finalgraph`

## Exact reviewed identity

- Base commit/tree: `5d5dfdefdad422d369205dbc260cd0ae8d871f87` / `2ef7dc67a35eff78583d27885247b803d6fe8c46`
- Final reviewed implementation commit/tree: `ba3124f4929528e8c95c04d7cfcf490e17791560` / `5e65240995885d2b4cbee040631893b3b3bf62d6`
- Full reviewed range: `5d5dfdefdad422d369205dbc260cd0ae8d871f87..ba3124f4929528e8c95c04d7cfcf490e17791560`
- Active graph: `6193ebf24dfd5dd6c6d1f52d03e7efda09e3335003ab36cf4a59d62d9598faf4`
- Checkout: clean
- `git diff --check`: pass

## Review conclusion

The final subject preserves the approved trust boundaries and repairs the host-pin, gate-contract, acceptance-count and active-authority inconsistencies without changing product data flow, database state, deployment authority or production mutation authority.

### Host and runner identity

The v3.15→v3.16 fixture delta is exactly `fixtureVersion` plus the ChatGPT bundle, Codex, Git and Node device identities changing from `16777233` to `16777232`. Paths, realpaths, inode, size, uid, gid, mode, executable hashes, versions, signing identifiers, Team ID, designated requirements, CodeDirectory hashes and notarized assessment are unchanged.

The canonical fixture is 2,132 bytes with SHA-256 `25e485f32668470f002dedc89425ddb5370dacf1a8a22a8ed0ac3fd3602c7f02`; the tracked file is 2,133 bytes. The 875-byte runner identity recomputes to `f875e175cd7d84cb0010bddaf16de4badd4968ba81bdb033aecd611b1be00baa`. Host verification remains exact and fail-closed; no range, learned value or fallback executable was introduced.

### Protected transition and gate semantics

The protected v3.15 model-oracle listing is `cb070b7f1b8acabd4f776e99c773693e96402c9375c2ae317b851138f73b62c5`; the reviewed v3.16 successor is `70dbbd6ed3846ada9804c029321dcc5e97de60ddf4e63a75142d10f2efdde115`. The base-owned worker resolves that exact transition to `model-runner-host-pin-amendment-v3.16`, while equality remains `protected_base` and altered or later successors fail closed. Candidate code cannot define its own transition or approval.

The external harness contract is v1.5 and matches the implementation: nineteen credential-free candidate tests plus two protected live tests, with the 28-case model partition measured independently. The canonical inventory is 320 cases partitioned `product_runtime=272`, `model_runner=28`, `evaluation_governance=20`; the 14 script rows recompute to `925b38923d04bc93c926bc5e09b75225d46ef2dcadb5a1de98f8cbef8ded4351`.

### Active authority consistency

The active catalog is 6,337 bytes with SHA-256 `f6842952ff768be01fe0b9e91bf1f2aa089168bfcb7964d6113c44a71deb21e5`, 55 ASCII-ordered files and 45 owner rows. Every owner header and the design/evidence GOV-004 tags agree, including `product-correctness-runtime-v3.11.12`. Independent reconstruction of all 55 `[path,blobOid,byteLength,sha256]` rows yields active graph `6193ebf24dfd5dd6c6d1f52d03e7efda09e3335003ab36cf4a59d62d9598faf4`.

No migration, schema, RPC, scheduling, concurrency, public compatibility, rollback or production-observability behavior changed in the reviewed range. Existing sandbox, process-group cleanup, journal recovery, immutable Git apply, disabled deployment and `productionMutationAuthorized:false` boundaries remain intact.

## Verification performed

- Protected external-worker and successor semantics: 12/12 passed.
- Focused GOV-001, GOV-004 and HYB-006 graph/count/script authority checks: 3/3 passed with zero skipped/todo.
- Model-runner host, sandbox, journal and execution suite: 21/21 passed with zero skipped/todo.
- Disabled doctor: passed with host pin v3.16 and `productionMutationAuthorized:false`.
- Core source-led V3 regression suite: 65/65 passed with zero skipped/todo.
- Independent catalog, owner-header, script-digest, fixture-delta, runner-identity and active-graph recomputation: passed.

## Boundaries

This PASS approves only the exact range and subject above. It does not assert publication of this evidence, installation of a graph-bound protected review source, exact-review completion, protected Code Gate completion, deployment, database migration, runtime activation or production mutation. Those remain separately authorized and fail-closed.

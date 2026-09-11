# Independent architecture/security review — PR #210 final implementation

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

Reviewer: independent architecture/security reviewer `/root/v316_architecture_review_finalgraph`

## Exact reviewed identity

- Base commit/tree: `9fbbd4ee1c20f8165bcf10e9ef8ec716b5f95c1c` / `ad3b1bd1bcdc4f15f8e7d7a1280da7c43ae8140e`
- Final reviewed implementation commit/tree: `c7b477607d044e339c3787b763a8408ee6a8d473` / `512d15239e47f7387be2e0b38be375a64e350f7e`
- Full reviewed range: `9fbbd4ee1c20f8165bcf10e9ef8ec716b5f95c1c..c7b477607d044e339c3787b763a8408ee6a8d473`
- Merge base: `9fbbd4ee1c20f8165bcf10e9ef8ec716b5f95c1c`
- Active graph SHA-256: `10ddc6020b010a557f2ad000e11df7ebb2413432bb63351d3a4a5bdba26c46bf`
- Active catalog: 6,758 bytes, SHA-256 `6b3f8dfadc3c9101e853b9748ca5579934bca1501a437138853d3651f7954cce`
- Catalog topology: 55 active files, 45 owner rows, one historical-audit file and three incorporated files
- Checkout: clean
- `git diff --check`: pass

## Review conclusion

The exact subject preserves the approved architecture, trust boundaries, point-in-time behavior, migration compatibility, concurrency controls, rollback posture and no-global-Shadow authority. The previously identified unbound-receipt and no-receipt mutable-state promotion paths are closed.

### Financial-validation trust boundary

Validation receipts are RPC-only. `service_role` has audit SELECT and only the three approved successor EXECUTE grants; it has no direct INSERT, UPDATE, DELETE or TRUNCATE privilege on either audit relation. The mutating functions are owned by the existing NOLOGIN/NOBYPASSRLS `opportunity_v3_rpc_owner`, are `SECURITY DEFINER`, use an empty `search_path`, and validate the database-authoritative `opportunity_runner` principal before mutation.

Only a principal-bound `official-financial-v2` receipt can enter the point-in-time reader or worker cache. Unbound V1 rows, including forged validated `prior_validation` and `effective_validation` images, cannot promote a fact. When no trusted V2 receipt exists at the requested cutoff, the reader now unconditionally overlays `pending` plus false validation dimensions and a null validation timestamp; it never falls through to mutable fact columns.

Mutable predecessor `validated`, `rejected`, `conflict` and `stale` states therefore cannot establish authority or starve first V2 validation. A trusted V2 validation may be superseded by a later conflict, while a trusted terminal rejection/conflict/stale state remains terminal under automatic retry. The V2 version discriminator separates successor receipts from V1 uniqueness collisions.

The validation writer locks the subject fact before reading prior trusted state and appending a transition, so concurrent validations serialize. Duplicate input is idempotent. Runtime document retry locks its receipt, records the immutable prior image, enforces request idempotency and the three-attempt bound, retries only closed parser-runtime failures, and rejects integrity failures.

The NOBYPASSRLS owner has only the required provenance SELECT and document-receipt SELECT/UPDATE bridge policies. The isolated PostgreSQL fixture exercised both RPCs with real RLS enabled, including successful retry, idempotent replay, denied direct receipt mutation, exact owners, grants and empty search paths.

### No-global-Shadow authority

Global Shadow remains retired from production publication, classification, UI, progress, health and promotion authority. Historical Shadow rows and evaluation machinery remain audit-only. Production does not call the retained observation writer, public snapshots omit Shadow progress, and the promotion aggregate accepts only the Code aggregate. Per-stock valuation, confidence, technical, market, risk and two-adjacent-official-close gates remain intact.

### Graph, host and protected-gate consistency

The active graph independently recomputes to `10ddc6020b010a557f2ad000e11df7ebb2413432bb63351d3a4a5bdba26c46bf`. The canonical acceptance inventory remains 320 cases partitioned as `product_runtime=272`, `model_runner=28` and `evaluation_governance=20`, with classification counts `143/171/6`.

The external harness remains v1.5 with nineteen credential-free candidate tests plus two protected live tests and exact protected predecessor-to-successor semantics. Host identity remains pinned to `codex-cli 0.153.4`; the tracked fixture is 2,133 bytes and its canonical 2,132-byte content hashes to `25e485f32668470f002dedc89425ddb5370dacf1a8a22a8ed0ac3fd3602c7f02`.

## Verification performed

- Independent commit, tree, merge-base, range, catalog and active-graph reconstruction: passed.
- Official validation migration and isolated real-PostgreSQL/RLS fixture: 3/3 passed, zero skipped or todo.
- Financial-validation, no-global-Shadow and protected gate focused suites: 26/26 passed, zero skipped or todo.
- No-receipt mutable `validated|rejected|conflict|stale` quarantine: passed.
- Forged V1 prior/effective images before and after their timestamp: passed.
- Bound V2 validation, later terminal rejection, repeat input and new passing-input retry: passed.
- RPC grants, owners, overload removal, empty search paths and RLS bridges: passed.
- `git diff --check`: passed.

## Boundaries

This PASS applies only to the exact immutable range and subject above. It does not itself publish this evidence, complete exact review or protected gates, authorize deployment, execute a production migration, enable runtime mutation, merge the PR or weaken any later release gate.

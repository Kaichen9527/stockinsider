# T07 financial provider preparation through guarded work context

Review candidate based on `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43`. The three-file patch applies cleanly to the exact Git blobs in the companion evidence. The protected PR and release HOLD remain in place.

The source projector pairs each selected fact with its exact row, PostgreSQL microsecond timestamp and hashed source receipt. The typed packet uses the existing original fact wire codec. Superseded observations can keep source receipts for inventory without becoming current provider facts. An unsupported current row refuses versioned preparation. The parser receipt clock is included for both exchange-hosted and approved issuer documents.

Both the admitted author entry point and cached preparation read the version from the existing author-bound `work-context` result. A missing marker selects the existing wire shape. An unknown marker refuses preparation. Cached resume rechecks the marker and the admitted execution immediately before preparing. Already-frozen legacy and versioned preparations keep their existing JSON and hash. The cached response exposes counts and status only.

The companion ACL fragment prepares owner-only execution for the twelve candidate functions. In a clean PostgreSQL 17.11 catalog the expected owner held execute on 12 functions. Each of four synthetic roles lacked direct execute on all 12. This check used privilege metadata. It did not execute any function as a denied role.

## Results

- Node 22.23.1 in an isolated non-root Contabo process. Five source scenarios, five admitted author cases and seven cached reconciliation cases passed. The expired parser observation was excluded. The admitted and cached writes contained the versioned object inside the packet hash. A protocol change, unknown value, changed execution input hash and non-author role produced zero prepare writes.
- PostgreSQL 17.11 in a disposable non-root, network-isolated database. The app-produced packet passed the recovered binder with one binding row. Missing provider facts or both binding fields refused before persisting a preparation. The earlier prepared row retained its hash without a new binding. Substitution and binding mutation were refused.
- The original migration's as-of data getter was replaced by synthetic rows for the binding test. The binder ran before the catalog ACL check. Neither test authorizes the complete migration or proves effective access under deployment roles. This did not connect to the production database, invoke a model or change a service.

## Integration still pending

The recovered SQL needs to emit `financialProviderProtocol: vnext-financial-provider-input-v1` from `vnext_command_v1` after the exact work-context role, job, execution, rights and hash checks. Bind the marker and new-insert trigger in the same transaction and refresh and verify the exact predecessor and successor body hashes. The proposed owner-only `vnext_financial_provider_status_v1` avoids adding a principal-name RPC to app-facing roles.

The original stock-scoped as-of reader grants execute to `service_role`. The candidate owner requires independently verified access through a narrowly scoped read path. Confirm effective permissions on the actual dependency graph when running the full candidate under that owner. Reuse the existing bounded internal stock identity getter where possible. Verify effective permissions and RLS for the source receipt and raw-price lookups with real authority fixtures. Confirm that provider input projection and public serializers exclude the new binding fields, and that the provider wire and statement time limits hold with a full stock.

## Reproduce

In an isolated checkout at the baseline, save the original `financial-evidence-sources.ts` next to itself as `financial-evidence-sources-legacy.ts` and apply `financial-provider-work-context.patch`. Set up a disposable Node fixture tree using the companion module map, which replaces network-facing dependencies and must stay out of the project checkout used for build or deployment. Run the copied `financial-provider-work-context-probe.mjs.txt` as `probe.mjs` from the fixture root with Node 22 and `--experimental-strip-types`.

The probe prints the producer's `nativeCase` for the existing `financial-provider-prepared-binding-probe.sql.txt` template. Use its `fixture`, `legacy`, `currentPlain` and `bound` fields to render the synthetic placeholders. `STAGE_STRIPPED` is `currentPlain.evidence` without `financialSourceReceipts`. Run the SQL in a fresh PostgreSQL 17 cluster without a listener. Apply and inspect the owner-only fragment only in that fixture.

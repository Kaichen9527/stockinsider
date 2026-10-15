# Author union installer negatives — actual isolated native

One execution only, 2026-10-15 23:40:49.797607–23:41:37.103338 UTC. **3 children + parent = 4 PASS; 0 fail/cancelled/skipped/todo.** No rerun, source repair, other native entry or business lifecycle was selected.

- Execution base: `ea878a1e35e038baa7b2241028380686fa7802b6`.
- Frozen harness subject: `a1b8ce77e48a7e26f45a2a587206b5ff5d132fea`; file SHA `cb700b76aedad901139ccf8eb3c7f475327bde38a8a5d8f1d7aef898a993f6be`.
- Product: `c08b1591f27522748c2f2a8b1ebadc128f857d77`; SQL SHA `18b0e4814410601ab8b254f274a7fe085230b922656038cc1f8fe2539c056f76`; profile `19526e0199a406857de4c9869afd3cb243f74603ee960f06bc5e812c5d291243`.
- All 293 sealed Git inputs / 9,812,469 bytes remained unchanged after execution. This branch adds handoff/evidence only; no new product or harness source identity.

## Actual cases

| Case | Original execution scope | Exact observed rejection | Evidence |
| --- | --- | --- | --- |
| busy | Full unchanged SQL, separate session lock holder | `P0001 author_union_busy` | Distinct writer/observer/holder; granted ExclusiveLock; query rejection + actual ReadyForQuery E; rollback I; complete before/after state equality; unlock/close/backend absence |
| drift | Full unchanged SQL after the one authorized disposable application_name config addition | `P0001 author_union_predecessor_namespace` | Exactly five derived snapshot leaf changes (one pg_proc config reflected in namespace/catalog and definition/hash); all other metadata/body/owner/security/search_path/ACL/OID/default/role/table unchanged; rollback preserves exact drift state |
| forced rollback | Private transaction envelope only: BEGIN + exact original 64,004-byte middle | `22012 division by zero` | Writer T sees exactly four pinned successor bodies, all original postconditions completed; independent RR/RO observer sees original predecessor; fixed SELECT 1/0 gives E; ROLLBACK I restores exact original on both connections |

Middle SHA `7337ee90fd2fc99aa4bd449dc820dd06709e79b23f4e73cb265153878a3757f1`. Only original leading `BEGIN;\n` and final `COMMIT;\n` were removed. No intermediate guard/statement/lock/body/postcondition was edited. **None of these three cases is an original full-script COMMIT acceptance.** Previous author lifecycle/receive-loss successful COMMITs retain their separate historical scope.

Full private snapshots: busy 3, drift 4, forced rollback 5; each includes complete original metadata/default ACLs/OIDs/roles/catalog/namespace/function definitions and all 13 fixed tables. All 13 tables were empty at these installer callbacks; this does not claim nonempty business-row preservation. Separate DB/JS canonical texts and original six predecessor body checks matched. The forced writer successor had exactly 16 derived leaf changes across four body/definition/hash representations; original observation and post-rollback snapshots match exactly.

The unchanged fixture subsequently completed its default protocol_only neutral setup. One preparation / zero revisions per case; measured logical bytes: busy **2584**, drift **2580**, forced rollback **2584**. No firstseal, author/model invocation, financial FD opens/closes or controller RPC occurred. These necessary fixture steps are not extra tests or business PASSes.

## Runtime and cleanup

Exact existing Node22.14.0 and PG17.11 binary hashes/version outputs were sealed before launch. Mandatory early FS preload, experimental strip types and test-concurrency=1 were used. Actual executable command and source identities were sealed before run. Fresh start free workspace/tmp: **8,593,125,376 / 14,824,304,640 bytes**. During the single workload minimum: **8,591,224,832 / 14,344,937,472 bytes**; both exceeded 8,589,934,592. Sampled session + PG RSS peak **958,652,416 bytes**, 0.2s sampling, not an instantaneous or system-wide peak. No floor reduction, file/cache deletion, unrelated process stop or extra permission repair occurred.

All 10 explicitly identified backend PIDs were absent after shutdown; native finally directly checked the installer observer/holder backend absence. Three owned clusters and socket directories were absent, all three server logs contain shutdown, and before/after log hashes are retained. Of 52 sampled workload/PG process IDs, 49 were absent and three remained **PID1 zombies with RSS0**: 668010, 668045, 668097. They are not reported absent. The unchanged fixture did not emit an independent whole secure-tree finally absence record; that specific cleanup evidence remains pending. No runtime source was altered to add it.

## Delivery and limits

Private raw is `/tmp/author-installer-neg-native-o16`; no full catalog/namespace/function body/row/principal or server log is published. Public receipt directory: `.agent/reports/2026-10-16T07-39-author-installer-negatives-native/`. It contains only the explicit safe witness/hash inventories, source/binary/command/resource identities, stack-free TAP and handoff. Public witness is maker-derived from existing raw, not independent native review or proof Root accessed private bytes. Evidence derivation used builtins only and did not rerun any PG/query/test.

Original source-only probe failures, prior SQL/fixture failures and prior successful native runs remain untouched and are not added to this count. This is disposable LOCAL engineering with the original explicit two-owner USAGE profile and synthetic neutral fixture; not formal peer/HBA, active production writer, approved author/source/article or production installation.

Pending full-goal work includes author legacy77/compatible-v2 differences; principal/lease/invocation/caps/rights negatives; actual four callers; independent reviewer/Q-R/review-pack/atomic publication; whole S-C-B-Q-R-A; claim-level semantic and formal two-article work; source coverage/Top20/technical observation/strategy/formal schedule/fixed peer installation. This run does not approve those scopes. No deployment, terminal PR helper, CI rerun, build/npm, external HTTP/SSH/VPS or production DB operation occurred. Wait for Root independent review; do not self-authorize the next slice.

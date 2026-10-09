# Existing publication storage — exclusive revision branches

This bounded slice implements the approved first-publication-v2 typed revision
union in the existing bundle and outbox tables. It does not publish a dossier,
create a new publication service, configure a model principal or dispatch work.
Do not change legacy dossier/receipt storage before its separately tested
submission transaction exists. The v2 branch cannot enter an old writer/claimer.

## Storage and identity

Add revision_kind (default legacy_detail_v1) and nullable research_input_revision_id,
research_company_id and research_snapshot_hash to candidate_dossier_bundles and
candidate_dossier_outbox_v5. Legacy rows retain required legacy revision and
published revision equality and all original FKs. Only research_input_v2 has null
legacy IDs; all three research identifiers are required and bind exactly to
research_article_input_revisions_v2 (including input_hash and symbol on bundle).
Use explicit NOT-NULL tests inside CHECK expressions to avoid SQL null bypass.
Research input FK is ON DELETE RESTRICT. Add partial unique indexes on exact
research revision/input hash (plus original publication_kind on outbox).

Outbox v2 requires publication_kind deep, original deep_job_id and deep_attempt,
and binds exact bundle/input/company/snapshot/hash and original input job/attempt.
A BEFORE INSERT/UPDATE trigger validates branch tuples. v2 identity is immutable;
v1 preserves original deep NULL-to-job/attempt claim and later-attempt retry
transitions. A revision discriminator cannot switch branches after insertion.
Bundle's existing append-only trigger remains. Current source liveness is NOT
proven by a storage FK; publication must separately recheck the live fences.
Never infer model execution, source rights or article quality from this lineage.

## Private write surface and legacy isolation

No v2 production insert endpoint/RPC in this slice. Owner guards execute as
SECURITY INVOKER, testing actual current_user before any definer helper; never
put the owner comparison inside a SECURITY DEFINER trigger. BEFORE INSERT requires
research_input_preparation_owner_v2 as current_user for a v2 bundle and
research_observed_rpc_owner for a v2 outbox. Those existing NOLOGIN owners receive
only required table INSERT/SELECT privileges; service_role direct v2 insertion,
anon/authenticated insertion and ordinary v2 claim fail closed. This inert slice
rejects ALL v2 outbox UPDATE/DELETE, including delivery-state changes, until the
reviewed atomic writer slice explicitly replaces that guard. BEFORE TRUNCATE
statement triggers reject truncation of either table whenever any v2 row exists;
v1-only READ COMMITTED truncate behavior stays unchanged. TRUNCATE rejects
REPEATABLE READ/SERIALIZABLE even if its old snapshot cannot see v2 rows. The
VOLATILE trigger checks transaction_isolation before checking existence, after
TRUNCATE acquired ACCESS EXCLUSIVE; READ COMMITTED existence uses a fresh command
snapshot, never STABLE. This conservative isolation restriction is explicit.
RLS cannot hide v2 rows from these
checks: the trigger performs a security-definer existence check owned by the
existing trusted input owner with explicit SELECT/RLS visibility on both tables. v1 owner/writer
permissions and row bytes remain unchanged. Future guarded RPCs must run as the
expected owner and repeat actual claim/source/author/review checks atomically.
Table identity constraints and trigger validation remain defense in depth.

Do not replace legacy claim functions blindly: verify exact existing ordinary
claim excludes publication_kind deep, and new CHECK ensures v2 is always deep.
Legacy deep claimer/submission requires a nonnull legacy revision and cannot
match v2 via null. Preserve old function bytes and all v1 rejection behavior.
Do not relax paid-content checks or add dossier/receipt nullability in this slice.

## Executable acceptance

Load actual legacy bundle/outbox migrations and latest deep fields into isolated
PostgreSQL, plus explicit synthetic upstream input/job rows; no fabricated
production catalogs. Legacy published/unpublished writer behaviors remain.
Accept lawful v1 rows/defaults and lawful v2 owner inserts; reject mixed/null
branches, nonexistent/mismatched input/company/snapshot/hash/symbol/job/attempt,
wrong bundle lineage and service direct v2 writes. Duplicate v2 bundle/outbox
identities reject; legacy duplicate rules unchanged. Verify ordinary claim never
selects v2, branch switching and ALL v2 outbox UPDATE/DELETE/TRUNCATE reject,
legacy first deep claim and retry attempt transitions still work, v1-only
TRUNCATE stays available, mixed v1/v2 TRUNCATE rejects, failed changes roll back
and rows survive restart. Two-session tests cover old REPEATABLE READ snapshot
then committed v2 insertion before TRUNCATE (must reject), and READ COMMITTED
TRUNCATE waiting behind v2 insertion then rejecting after commit. No permission
revocation or old writer modification substitutes for these concurrency tests.
Run existing real-PG outbox/deep-publication regression tests, type/lint/build and
independent design/code review. Native HTTP publication remains later acceptance;
this slice does not claim publication or genuine author/reviewer execution.

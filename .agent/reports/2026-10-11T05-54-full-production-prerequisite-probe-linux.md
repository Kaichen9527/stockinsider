Full original prerequisite investigation — Linux PG17

Exact source `bc01c006cba307735ccd50c78841b94242e1c014`; tree `deb7d94524533b1318f0a0237cc7bd09e2269322`. Original source/migration/installer bytes retained.

First actual RED: full `supabase_schema.sql` line19 reports SQLSTATE3F000 schema auth absent; profiles FK line14 requires auth.users(id). Original full VPS compatibility bootstrap succeeded, but it only creates roles/pgcrypto before pg_restore, not provider auth/users. Schema --single-transaction rolled back; authSchema/authUsers/publicStocks all null. No stub or skipped statement; no retry. Full chain not started.

Original prerequisite sources found (static only):

- source_entities/source_raw_documents: 20260315_research_system_v2.sql.
- candidate_source_mentions: 20260830_source_ranking_v2.sql.
- official prices/detail/dossier: 20260901_source_research_shadow_v2.sql.
- bundles/submission receipts/submission-v4 and immutable trigger: 20260906_candidate_dossier_v4.sql.
- outbox-v5: 20260907_candidate_dossier_outbox_v5.sql, must precede v6.
- financial acquisition/provenance: 20260906_financial_acquisition_v4.sql; document receipts/parser: 20260907_02/03 files, required before base position40 official validation.

A separately sanctioned 15-file funnel installer already lists original v4/v5 dependencies. The current V3 installer has48 base +ownership prelude +6 research and assumes that real baseline exists. All hashes and dependency edges are in migration-inventory/dependency-findings; the new candidate publication order is not a reviewed installed plan. Repo has16 observed/publication modules +insider snapshot +isolation=18 dated successors; root must preserve its chosen17-publication+isolation scope explicitly rather than infer a fresh installer from this inventory.

Additional static requirement: compatibility bootstrap creates stockinsider_runtime_v319 NOLOGIN, whereas reviewed installer expects LOGIN/NOINHERIT/connection limit6 and restricted capabilities. This role prerequisite was not changed or asserted as an executed installer failure. Prior October5 rehearsal used private schema exports (hashes recorded in findings), absent from Git; partial native fixture fragments cannot replace them.

Sampled peak RSS 65323008 bytes; minimum free 10080358400 bytes. Disposable cluster stopped and removed; postgres log/raw RED retained. 26 raw files/43793 bytes with individual SHA256. Manual elapsed 440.1s; deadline06:17:35Z.

No production/credentials/models/attestation/main merge/deployment/build/browser.

Root supplemental read-only production observation (attributed, not VM queried): PG17.11/stockinsider already has source_entities/source_raw_documents and v4/v5 dossier/detail/stage/bundle/outbox/submission tables; new research-version tables absent, old research_memos/research_reports present. Therefore this empty-PG auth error is not proof that live VPS lacks the legacy prerequisites. Root's newer18-file guard/pin/residue work is not part of exactbc01 and full production profile remains unverified. No additional database run.

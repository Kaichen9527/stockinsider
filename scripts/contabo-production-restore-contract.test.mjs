import assert from 'node:assert/strict';
import { statSync, readFileSync } from 'node:fs';
import test from 'node:test';

const scriptPath=new URL('../deployment/vps/restore-contabo-database.sh',import.meta.url);
const script=readFileSync(scriptPath,'utf8');
const verify=readFileSync(new URL('../deployment/vps/verify-contabo-database.sql',import.meta.url),'utf8');

test('production restore is stdin-only, staged, local-only and never replaces a database',()=>{
  assert.equal(statSync(scriptPath).mode&0o777,0o755);
  assert.match(script,/pg_restore --dbname="\$stage_database" --use-list="\$toc_path"[\s\S]*--exit-on-error --no-password/u);
  assert.doesNotMatch(script,/--no-owner/u,
    'the archive application owners must be replayed after compatibility roles are bootstrapped');
  for(const migration of ['20260909_official_financial_validation_receipts.sql',
    '20260911_02_financial_field_work_fairness.sql','20260911_03_financial_document_job_links.sql',
    '20260911_candidate_financial_fact_manifest_v8.sql','20260911_04_taiwan_candidate_refresh_queue.sql',
    '20260911_05_financial_fact_isolation_v10.sql','20260911_candidate_history_backfill_v1.sql',
    '20260912_02_financial_validation_status_text_hotfix.sql','20260911_contabo_data_plane_v1.sql'])
    assert.match(script,new RegExp(migration.replace(/[.]/gu,'[.]'),'u'));
  assert.match(script,/wal_level=minimal -c max_wal_senders=0 -c archive_mode=off/u);
  assert.match(script,/already exists; refusing replacement/u);
  assert.match(script,/createdb --template=template0 --encoding=UTF8 --locale=C "\$stage_database"/u);
  assert.ok(script.includes('^/run/stockinsider-restore/[0-9a-f]{40}[.]toc$'),
    'the reviewed TOC must live in a dedicated runtime directory outside private artifacts');
  assert.match(script,/"\$toc_group" != postgres \|\| "\$toc_mode" != 640/u,
    'the postgres restore process must have read-only access to the reviewed TOC');
  assert.match(script,/ALTER DATABASE \$stage_database RENAME TO \$final_database/u);
  assert.match(script,/pg_ctlcluster 17 "\$cluster_name" start\nstarted=true\n/u,
    'a failed post-restart verification must stop the unverified cluster');
  assert.match(script,/postgrestActivated.*false.*webSwitched.*false/u);
  assert.doesNotMatch(script,/\n(?:sudo\s+-u\s+postgres\s+)?pg_dump|DROP DATABASE|rm -rf|systemctl (?:start|restart) stockinsider/u);
});

test('restored application contract verifies private runtime and excludes Vault',()=>{
  for(const relation of ['source_run_ledger','candidate_source_mentions','candidate_research_runs',
    'candidate_research_run_items','official_price_history','candidate_detail_snapshots','radar_public_snapshots']){
    assert.match(verify,new RegExp(`'${relation}'`,'u'));
  }
  assert.ok(verify.includes("current_setting('listen_addresses')<>''"));
  assert.match(verify,/to_regnamespace\('vault'\) IS NOT NULL/u);
  assert.match(verify,/extname='supabase_vault'/u);
  assert.match(verify,/identityFenceEnabled/u);
  assert.match(verify,/claim_taiwan_data_refresh_jobs_v6/u);
  assert.match(verify,/complete_candidate_financial_document_receipt_parser_v10/u);
  assert.match(verify,/opportunity_financial_facts_v3[\s\S]*opportunity_v3_rpc_owner/u);
  assert.match(verify,/financial_validation_status_v3/u);
});

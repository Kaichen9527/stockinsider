import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {migrationBodyInAtomicTransaction} from './atomic-migration-chain.mjs';
import {tailMetadataSha} from './research-publication-tail-entry-guard.mjs';

const sourcePath='../../migrations/20260920_auo_forward_bvps_pb_contract_v1.sql';
const sourceSha256='3341e1b34f0c94adad78950ebd7092af6233cdac79abb684ce739d3530314d52';
const checkProfiles=[
 ['candidate_research_run_items','candidate_research_run_items_valuation_method_check',false,
  '93098b41361ccfc8176d28c5d5db8f1f26726ffb40431e5287d8eec57edbd958','3bcdfeaf36cc52292a0ca961b214e4eefcfeba5e98e3f2eb42efa5a9903e8da2'],
 ['valuation_snapshots','valuation_snapshots_primary_method_check',true,
  '0e9648db4318a07380efd88c87567f828c12c1a04009d8faebc92c2e094584c0','9a691561a07f2713399160e9b707bc0f8fecb264dc6ca341d3b0f0622130bf29'],
 ['valuation_snapshots','valuation_snapshots_valuation_basis_check',true,
  '0091d5c7a9b34f12ddd8c0da1f0dbfc97f57b38d8ba4b5d5808b9868104a52ac','545f0909184727d2a89dab1895c44376f60814ceef1c01c9e6ed7d3b2328db1b'],
];
const checkNames=checkProfiles.map(([,name])=>name);
const stageIdentitySql=
 "SELECT current_database()='t17_restored' AND current_user='si-t18-db' AND session_user='si-t18-db' "+
 "AND inet_server_addr() IS NULL AND current_setting('listen_addresses')='' AND current_setting('port')='6551' AS isolated";
const sealedArchivePeerIdentitySql = `SELECT
  current_database()='t17_restored' AND current_user='postgres' AND session_user='postgres'
  AND SYSTEM_USER='peer:si-t18-db' AND inet_server_addr() IS NULL
  AND current_setting('listen_addresses')='' AND current_setting('port')='6551'
  AND current_setting('server_version_num')::int BETWEEN 170000 AND 179999
  AND current_setting('data_directory') ~ '^/run/t18-db-work/t17-owned-restore-[a-z0-9_]+/data$'
  AND current_setting('unix_socket_directories')=regexp_replace(current_setting('data_directory'),'/data$','/socket')
  AND (SELECT rolpassword IS NULL AND rolsuper AND rolcanlogin FROM pg_catalog.pg_authid WHERE rolname='postgres')
  AND (SELECT count(*)=4 AND bool_and(error IS NULL) AND bool_and(database=ARRAY['all']::text[])
     AND count(*) FILTER (WHERE rule_number=1 AND type='local' AND auth_method='peer'
       AND user_name=ARRAY['postgres']::text[] AND options=ARRAY['map=t18_peer']::text[])=1
     AND count(*) FILTER (WHERE type='local' AND auth_method='reject' AND user_name=ARRAY['all']::text[])=1
     AND count(*) FILTER (WHERE type='host' AND auth_method='reject' AND user_name=ARRAY['all']::text[])=2
     FROM pg_catalog.pg_hba_file_rules)
  AND (SELECT count(*)=1 AND count(*) FILTER (WHERE map_name='t18_peer' AND sys_name='si-t18-db'
        AND pg_username='postgres' AND error IS NULL)=1 FROM pg_catalog.pg_ident_file_mappings)
  AS isolated`;
const profileSql=
 "SELECT t.relname AS name, c.conname AS constraint, c.convalidated AS validated, "+
 "pg_get_constraintdef(c.oid,true) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid "+
 "JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' "+
 "AND t.relname IN ('candidate_research_run_items','valuation_snapshots') AND c.contype='c' "+
 "AND c.conname=ANY($1::text[]) ORDER BY t.relname COLLATE \"C\",c.conname COLLATE \"C\"";
const countSql="SELECT (SELECT count(*)::text FROM public.candidate_research_run_items) AS research_items, "+
 "(SELECT count(*)::text FROM public.valuation_snapshots) AS valuations";

export async function assertContaboValuationBridgeStage(client, {sealedArchivePeer = false} = {}) {
  const identitySql = sealedArchivePeer === true ? sealedArchivePeerIdentitySql : stageIdentitySql;
  if((await client.query(identitySql)).rows?.[0]?.isolated!==true)
    throw Error('contabo_valuation_bridge_stage_required');
}

async function readChecks(client) {
  return (await client.query(profileSql,[checkNames])).rows;
}

function matches(rows,shaIndex) {
  return rows.length===checkProfiles.length&&rows.every((row,index)=>{
    const profile=checkProfiles[index];
    return row.name===profile[0]&&row.constraint===profile[1]&&row.validated===profile[2]&&
      typeof row.definition==='string'&&tailMetadataSha(row.definition)===profile[shaIndex];
  });
}

/** Runs inside the publication transaction on its owned staging client.
 * The final catalog gate and caller determine whether this transaction commits.
 * Statement and lock timeouts belong to the transaction owner. */
export async function stageContaboHistoricalValuation(client, options) {
  await assertContaboValuationBridgeStage(client, options);
  const bytes=readFileSync(new URL(sourcePath,import.meta.url));
  if(createHash('sha256').update(bytes).digest('hex')!==sourceSha256)
    throw Error('contabo_valuation_bridge_source_changed');
  await client.query('LOCK TABLE public.candidate_research_run_items,public.valuation_snapshots IN ACCESS EXCLUSIVE MODE');
  const before=await readChecks(client);
  if(matches(before,4))return Object.freeze({status:'already_present',sourceSha256,verifiedChecks:3,rowCountsUnchanged:true});
  if(!matches(before,3))throw Error('contabo_valuation_bridge_unrecognized_checks');
  const counts=(await client.query(countSql)).rows[0];
  await client.query(migrationBodyInAtomicTransaction(bytes.toString('utf8')));
  if(!matches(await readChecks(client),4))throw Error('contabo_valuation_bridge_postcondition');
  const after=(await client.query(countSql)).rows[0];
  if(counts.research_items!==after.research_items||counts.valuations!==after.valuations)
    throw Error('contabo_valuation_bridge_row_count_changed');
  return Object.freeze({status:'applied',sourceSha256,verifiedChecks:3,rowCountsUnchanged:true});
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
const file='scripts/opportunity-v3/apply-reviewed-migrations.mjs';
test('product delta is exactly the two approved wrapper OID targets plus one approved compaction owner; every other check unchanged',()=>{
 let original=execFileSync('git',['show',`b2f1b6c30758a4e4ff9a28d938cc06c2b86976fa:${file}`],{encoding:'utf8'});
 const first="FROM pg_proc WHERE oid='public.claim_legacy_producer_job_pre_handoff_v3_19_16(uuid,uuid,uuid,integer)'::regprocedure)";
 const firstStart=original.indexOf("      ,'finalClaimHandoff'");const firstEnd=original.indexOf("      ,'partialResume'",firstStart);const firstChunk=original.slice(firstStart,firstEnd);
 assert.equal(firstChunk.split(first).length,2);original=original.slice(0,firstStart)+firstChunk.replace(first,"FROM pg_proc WHERE oid='public.claim_legacy_producer_job_pre_kol_authority_v3_20(uuid,uuid,uuid,integer)'::regprocedure)")+original.slice(firstEnd);
 const start=original.indexOf("      ,'v320KolRetentionBridge'");const end=original.indexOf("      ,'v320KolClaimPayloadCompaction'",start);const chunk=original.slice(start,end);
 const second="FROM pg_proc WHERE oid='public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)'::regprocedure)";
 assert.equal(chunk.split(second).length,2);original=original.slice(0,start)+chunk.replace(second,"FROM pg_proc WHERE oid='public.claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2(uuid,uuid,uuid,integer)'::regprocedure)")+original.slice(end);
 const compStart=original.indexOf("      ,'v320KolClaimPayloadCompaction'");const compEnd=original.indexOf("      ,'v320KolRetentionOwnerBoundary'",compStart);const comp=original.slice(compStart,compEnd);assert.equal(comp.split("pg_get_userbyid(proowner)='legacy_correctness_rpc_owner'").length,2);original=original.slice(0,compStart)+comp.replace("pg_get_userbyid(proowner)='legacy_correctness_rpc_owner'","pg_get_userbyid(proowner)='opportunity_v3_rpc_owner'")+original.slice(compEnd);
 assert.equal(fs.readFileSync(file,'utf8'),original);
});
test('approved latest migration delegates via retained terminal wrapper and compaction owner is explicitly opportunity owner',()=>{
 const terminal=fs.readFileSync('migrations/20260911_v320_source_terminal_projection_authority.sql','utf8');
 assert.ok(terminal.includes('RENAME TO claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2'));
 assert.ok(terminal.includes("'claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2' IN pg_get_functiondef"));
 const compact=fs.readFileSync('migrations/20260830_v320_kol_claim_payload_compaction.sql','utf8');
 assert.ok(compact.includes('uuid,uuid,uuid,integer) OWNER TO opportunity_v3_rpc_owner'));
 // This is source audit, not permission to change the untouched installed predicate.
});

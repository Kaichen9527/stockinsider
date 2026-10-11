import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const {Client}=createRequire(import.meta.url)('pg');
const predecessor=fs.readFileSync('migrations/20260929_research_agent_state_v1.sql','utf8');
const successor=fs.readFileSync('migrations/20261011_research_thesis_isolation_v1.sql','utf8');
const guard="\n  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'\n    THEN RAISE EXCEPTION 'research_thesis_read_committed_required'; END IF;";
test('thesis append isolation successor rejects stale roots and preserves RC reconciliation', {timeout:30000}, async t=>{
 const bin=execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'si-thesis-isolation-')),data=path.join(tmp,'pg');
 const port=55500+process.pid%1000;let running=false;const clients=[];
 const run=(name,args)=>execFileSync(path.join(bin,name),args,{stdio:'pipe'});
 try{
  run('initdb',['-D',data,'-U','postgres','-A','trust','--no-instructions']);
  run('pg_ctl',['-D',data,'-l',path.join(tmp,'pg.log'),'-o',`-h '' -k ${tmp} -p ${port}`,'-w','start']);running=true;
  for(let i=0;i<2;i++){const c=new Client({host:tmp,port,user:'postgres',database:'postgres',statement_timeout:5000});await c.connect();clients.push(c);}
  const[a,b]=clients;
  // Exact application table/index/function/trigger, synthetic three FK parents.
  await a.query('CREATE TABLE stocks(id uuid PRIMARY KEY);CREATE TABLE candidate_detail_snapshots(id uuid PRIMARY KEY);CREATE TABLE candidate_research_dossiers(id uuid PRIMARY KEY);');
  await a.query(predecessor.slice(predecessor.indexOf('CREATE TABLE IF NOT EXISTS public.candidate_thesis_qualifications_v1 ('),predecessor.indexOf('CREATE TABLE IF NOT EXISTS public.candidate_technical_decisions_v1 (')));
  const start=predecessor.indexOf('CREATE OR REPLACE FUNCTION public.fence_candidate_thesis_append_v1()');
  await a.query(predecessor.slice(start,predecessor.indexOf('REVOKE ALL ON FUNCTION public.fence_candidate_thesis_append_v1()',start)));
  const definition=async()=> (await a.query("SELECT oid::text,prosrc,proowner::text,proacl::text,proconfig,prosecdef,provolatile,proisstrict,proleakproof,proparallel,procost,prorows FROM pg_proc WHERE oid='fence_candidate_thesis_append_v1()'::regprocedure")).rows[0];
  const before=await definition();await a.query(successor);const after=await definition();
  await t.test('only first-statement guard changes and retry preserves OID, owner, ACL and semantics',async()=>{
   assert.equal(after.prosrc.replace(guard,''),before.prosrc);
   const{prosrc:oldBody,...oldAttrs}=before,{prosrc:newBody,...newAttrs}=after;
   assert.deepEqual(newAttrs,oldAttrs);assert.ok(oldBody&&newBody);
   await a.query(successor);assert.deepEqual(await definition(),after);
  });
  await t.test('changed predecessor semantics fail before replacement',async()=>{
   for(const alteration of ['IMMUTABLE','SECURITY INVOKER','STRICT','PARALLEL SAFE','COST 200','SET search_path TO public']){
    await a.query('BEGIN');await a.query('ALTER FUNCTION fence_candidate_thesis_append_v1() '+alteration);
    await assert.rejects(a.query(successor),/research_precision_predecessor_changed/);await a.query('ROLLBACK');assert.deepEqual(await definition(),after);
   }
  });
  await t.test('missing or changed trigger body rejects without creating a replacement',async()=>{
   await a.query('BEGIN');await a.query('DROP FUNCTION fence_candidate_thesis_append_v1() CASCADE');
   await assert.rejects(a.query(successor),/research_precision_predecessor_missing/);await a.query('ROLLBACK');
   await a.query('BEGIN');await a.query("DO $change$ BEGIN EXECUTE replace(pg_get_functiondef('fence_candidate_thesis_append_v1()'::regprocedure),'research_thesis_head_changed','changed_thesis_head'); END $change$;");
   await assert.rejects(a.query(successor),/research_precision_predecessor_changed/);await a.query('ROLLBACK');
   assert.deepEqual(await definition(),after);
  });
  await t.test('mapping successor changes only code closure; financial values, schemas and routine privileges remain exact',async()=>{
   const original=fs.readFileSync('migrations/20261009_research_complete_input_v2.sql','utf8');
   const mappingFunction=original.match(/CREATE FUNCTION public\.research_complete_mapping_v2\(symbol text\).*?AS \$\$.*?\$\$;/s)[0];
   const migration=fs.readFileSync('migrations/20261011_research_complete_mapping_precision_v2.sql','utf8');
   await assert.rejects(a.query(migration),/research_precision_predecessor_missing/);
   await a.query('ROLLBACK');await a.query(mappingFunction);
   const rows=async()=> (await a.query("SELECT s, research_complete_mapping_v2(s) AS mapping FROM unnest(ARRAY['2409','2383','0000']) s ORDER BY s")).rows;
   const metadata=async()=> (await a.query("SELECT oid::text,proowner::text,proacl::text,proconfig,prosecdef,provolatile,proisstrict,proleakproof,proparallel,procost,prorows FROM pg_proc WHERE oid='research_complete_mapping_v2(text)'::regprocedure")).rows;
   const oldRows=await rows(),attrs=await metadata();await a.query(migration);const newRows=await rows();
   const mapping=JSON.parse(fs.readFileSync('web/src/lib/research-complete-mapping.json','utf8'));
   for(let i=0;i<oldRows.length;i++){
    if(oldRows[i].mapping===null){assert.equal(newRows[i].mapping,null);continue;}
    assert.equal(newRows[i].mapping.sourceClosureHash,mapping.sourceClosureHash);
    assert.notEqual(newRows[i].mapping.sourceClosureHash,oldRows[i].mapping.sourceClosureHash);
    const{sourceClosureHash:oldHash,...oldFinancial}=oldRows[i].mapping;
    const{sourceClosureHash:newHash,...newFinancial}=newRows[i].mapping;
    assert.deepEqual(newFinancial,oldFinancial);assert.ok(oldHash&&newHash);
   }
   assert.deepEqual(await metadata(),attrs);await a.query(migration);assert.deepEqual(await rows(),newRows);
   for(const alteration of ['VOLATILE','SECURITY DEFINER','STRICT','PARALLEL SAFE','COST 200','SET search_path TO public']){
    await a.query('BEGIN');await a.query('ALTER FUNCTION research_complete_mapping_v2(text) '+alteration);
    await assert.rejects(a.query(migration),/research_precision_predecessor_changed/);await a.query('ROLLBACK');
    assert.deepEqual(await metadata(),attrs);
   }
  });
  const stock=randomUUID(),detail=randomUUID(),dossier=randomUUID();
  await a.query('INSERT INTO stocks VALUES($1)',[stock]);await a.query('INSERT INTO candidate_detail_snapshots VALUES($1)',[detail]);await a.query('INSERT INTO candidate_research_dossiers VALUES($1)',[dossier]);
  const insert=async(c,{parent=null,hash='a'.repeat(64),events=[],at='2026-10-11T00:00:00Z'}={})=>{
   const next='2026-10-12T00:00:00Z',payload={reviewReceiptHash:hash,status:'qualified',articleHash:hash,qualifiedAt:at,nextReviewAt:next,materialEventIds:events};
   return (await c.query("INSERT INTO candidate_thesis_qualifications_v1(stock_id,detail_revision_id,dossier_id,article_hash,evidence_snapshot_hash,review_receipt_hash,status,horizon,payload,qualified_at,next_review_at,parent_id) VALUES($1,$2,$3,$4,$4,$4,'qualified','1-3m',$5,$6,$7,$8) RETURNING id",[stock,detail,dossier,hash,payload,at,next,parent])).rows[0].id;
  };
  await t.test('real two-connection RR snapshot cannot insert a second root after competing RC commit',async()=>{
   await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await b.query('SELECT count(*) FROM candidate_thesis_qualifications_v1');
   const root=await insert(a,{events:['official-event']});
   await assert.rejects(insert(b,{hash:'b'.repeat(64)}),/research_thesis_read_committed_required/);await b.query('ROLLBACK');
   assert.equal((await a.query('SELECT count(*) FROM candidate_thesis_qualifications_v1')).rows[0].count,'1');
   await assert.rejects(insert(a,{hash:'b'.repeat(64),at:'2026-10-11T01:00:00Z'}),/research_thesis_head_changed/);
   await assert.rejects(insert(a,{parent:root,hash:'b'.repeat(64),at:'2026-10-11T01:00:00Z'}),/research_thesis_events_not_reconciled/);
   const next=await insert(a,{parent:root,hash:'b'.repeat(64),events:['official-event'],at:'2026-10-11T01:00:00Z'});
   assert.notEqual(root,next);
  });
  await t.test('serializable rejects before any append while history is retained',async()=>{
   await b.query('BEGIN ISOLATION LEVEL SERIALIZABLE');await b.query('SELECT count(*) FROM candidate_thesis_qualifications_v1');
   await assert.rejects(insert(b),/research_thesis_read_committed_required/);await b.query('ROLLBACK');
   assert.equal((await a.query('SELECT count(*) FROM candidate_thesis_qualifications_v1')).rows[0].count,'2');
  });
 }finally{for(const c of clients){await c.query('ROLLBACK').catch(()=>{});await c.end();}if(running)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);fs.rmSync(tmp,{recursive:true,force:true});}
});

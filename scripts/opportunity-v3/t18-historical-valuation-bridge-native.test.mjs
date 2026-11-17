import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import test from 'node:test';
import {applyPublicationTailToEngineeringClient} from './research-publication-tail-atomic-client.mjs';
import {loadPublicationTail} from './research-publication-tail-extraction.mjs';
import {stageContaboHistoricalValuation} from './t18-historical-valuation-bridge.mjs';

const {Client}=createRequire(import.meta.url)('pg');
const root=resolve(import.meta.dirname,'../..');
const tail=loadPublicationTail(root);
const oldMigration=readFileSync(join(root,'migrations/20260907_evidence_valuation_contract_v6.sql'),'utf8');
const oldChecks=oldMigration.match(/ALTER TABLE public\.(?:valuation_snapshots|candidate_research_run_items)\s+ADD CONSTRAINT (?:valuation_snapshots_(?:primary_method|valuation_basis)|candidate_research_run_items_valuation_method)_check[^;]*;/gu);
assert.equal(oldChecks?.length,3);
const inspectSql="SELECT c.oid::text,c.conname,c.convalidated,pg_get_constraintdef(c.oid,true) AS definition "+
 "FROM pg_constraint c WHERE c.conrelid IN ('public.valuation_snapshots'::regclass,'public.candidate_research_run_items'::regclass) "+
 "ORDER BY c.conname";

test('historical valuation bridge on an owned PostgreSQL 17 cluster', {timeout:90000}, async t=>{
  assert.notEqual(process.getuid(),0);
  const pg=execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
  assert.match(execFileSync(join(pg,'postgres'),['--version'],{encoding:'utf8'}),/\b17[.]/u);
  const dir=mkdtempSync(join(tmpdir(),'si-valuation-bridge-'));
  const data=join(dir,'data');
  const connections=new Set();
  let started=false;
  const command=(name,args)=>execFileSync(join(pg,name),args,{stdio:'pipe'});
  const connect=async (database='t17_restored')=>{
    const c=new Client({host:dir,user:'si-t18-db',database,port:6551,connectionTimeoutMillis:2000,statement_timeout:8000});
    await c.connect();
    connections.add(c);
    c.once('end',()=>connections.delete(c));
    return c;
  };
  try{
    command('initdb',['-D',data,'-U','si-t18-db','-A','trust','--no-sync','--no-locale']);
    command('pg_ctl',['-D',data,'-l',join(dir,'pg.log'),'-o',"-c listen_addresses='' -k "+dir+" -p 6551 -c shared_buffers=16MB",'-w','start']);
    started=true;
    const admin=await connect('postgres');
    await admin.query('CREATE DATABASE t17_restored');
    await admin.end();
    const observer=await connect();
    await observer.query("CREATE TABLE public.valuation_snapshots (id text,primary_method text,valuation_basis text); "+
      "CREATE TABLE public.candidate_research_run_items (id text,valuation_method text); "+
      "CREATE FUNCTION public.fixture_valuation_marker() RETURNS boolean LANGUAGE sql AS 'SELECT true'; "+
      oldChecks.join('\n')+
      " INSERT INTO public.valuation_snapshots VALUES ('old','forward_pe','forward_12m');"+
      " INSERT INTO public.candidate_research_run_items VALUES ('old','forward_12m')");
    const before=(await observer.query(inspectSql)).rows;

    await t.test('wrong database refuses before owning any transaction',async()=>{
      const c=await connect('postgres');
      await assert.rejects(applyPublicationTailToEngineeringClient(c,tail,{contaboHistoricalValuation:true}),
        /contabo_valuation_bridge_stage_required/u);
      assert.deepEqual((await observer.query(inspectSql)).rows,before);
    });

    await t.test('would-be bridge rolls back with the unchanged whole-catalog gate',async()=>{
      const c=await connect();
      await assert.rejects(applyPublicationTailToEngineeringClient(c,tail,{contaboHistoricalValuation:true}),error=>{
        assert.equal(error.message,'publication_tail_predecessor_namespace_mismatch');
        assert.equal(error.valuationBridge?.status,'applied');
        assert.equal(error.valuationBridge?.verifiedChecks,3);
        assert.equal(error.valuationBridge?.rolledBack,true);
        return true;
      });
      assert.deepEqual((await observer.query(inspectSql)).rows,before);
    });

    await t.test('an unknown constraint definition refuses without touching known profiles',async()=>{
      const c=await connect();
      await c.query('BEGIN');
      try{
        await c.query("ALTER TABLE public.valuation_snapshots DROP CONSTRAINT valuation_snapshots_valuation_basis_check; "+
          "ALTER TABLE public.valuation_snapshots ADD CONSTRAINT valuation_snapshots_valuation_basis_check CHECK (valuation_basis IS NOT NULL)");
        const mixed=(await c.query(inspectSql)).rows;
        await assert.rejects(stageContaboHistoricalValuation(c),/contabo_valuation_bridge_unrecognized_checks/u);
        assert.deepEqual((await c.query(inspectSql)).rows,mixed);
      }finally{await c.query('ROLLBACK');await c.end();}
      assert.deepEqual((await observer.query(inspectSql)).rows,before);
    });

    await t.test('explicit isolated commit followed by identical replay preserves rows and constraint IDs',async()=>{
      const c=await connect();
      try{
        await c.query('BEGIN');
        assert.equal((await stageContaboHistoricalValuation(c)).status,'applied');
        await c.query('COMMIT');
        const installed=(await observer.query(inspectSql)).rows;
        assert.equal(installed.length,3);
        assert.deepEqual(installed.map(row=>row.convalidated),before.map(row=>row.convalidated));
        assert.ok(installed.every(row=>row.definition.includes('forward_bvps_pb')));
        await c.query('BEGIN');
        assert.equal((await stageContaboHistoricalValuation(c)).status,'already_present');
        await c.query('COMMIT');
        assert.deepEqual((await observer.query(inspectSql)).rows,installed);
        assert.deepEqual((await observer.query('SELECT * FROM public.valuation_snapshots')).rows,
          [{id:'old',primary_method:'forward_pe',valuation_basis:'forward_12m'}]);
        assert.deepEqual((await observer.query('SELECT * FROM public.candidate_research_run_items')).rows,
          [{id:'old',valuation_method:'forward_12m'}]);
      }finally{await c.end();}
    });
  }finally{
    for(const c of connections)await c.end();
    if(started)command('pg_ctl',['-D',data,'-m','fast','-w','stop']);
    rmSync(dir,{recursive:true,force:true});
  }
});

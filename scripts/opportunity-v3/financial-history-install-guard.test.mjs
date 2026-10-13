import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import {MIGRATIONS,parseArguments,applyReviewedMigrationPlanToClient} from './apply-reviewed-migrations.mjs';
import {FINANCIAL_TAIL,FINANCIAL_TAIL_SHA256,BASE_CHAIN_SHA256,orderedHash,selectFinancialHistoryChain,assertFinancialReviewBinding,assertInstalledFinancialHistoryPlan,verifyFinancialHistoryPostconditions,FINANCIAL_HISTORY_EXPECTED_CATALOG,assertFinancialHistoryCatalog} from './financial-history-install-guard.mjs';
const base=MIGRATIONS.map(relativePath=>({relativePath,bytes:fs.readFileSync(relativePath),sha256:createHash('sha256').update(fs.readFileSync(relativePath)).digest('hex')}));
const tail={relativePath:FINANCIAL_TAIL,bytes:fs.readFileSync(FINANCIAL_TAIL),sha256:FINANCIAL_TAIL_SHA256};
const chain=selectFinancialHistoryChain(base,tail,true);
const empty={observations:false,wrapper:false,reader:false,residue:false,unknown_successor:false};
const good=Object.fromEntries(['observationRls','observationAcl','periodBound','appendWrapper','privatePredecessor','immutable','ownerNoCreate','pageReader'].map(k=>[k,true]));
const clientFor=state=>({query:async sql=>({rows:[sql.includes(' AS observations')?state:sql.includes(' AS catalog')?{catalog:FINANCIAL_HISTORY_EXPECTED_CATALOG}:{result:good}]})});
test('default 48 ordered bytes/digest are unchanged; opt-in has exactly the pinned tail49',()=>{
 assert.equal(base.length,48);assert.equal(orderedHash(base),BASE_CHAIN_SHA256);
 assert.deepEqual(selectFinancialHistoryChain(base,null),base);assert.equal(chain.length,49);
 assert.deepEqual(chain.slice(0,48),base);assert.equal(chain.at(-1).sha256,FINANCIAL_TAIL_SHA256);
 assert.notEqual(orderedHash(chain),BASE_CHAIN_SHA256);
 const plan=JSON.parse(execFileSync(process.execPath,['scripts/opportunity-v3/migration-plan.mjs','--financial-history-extension'],{encoding:'utf8'}));
 assert.equal(plan.migrations.length,49);assert.equal(plan.orderedChainSha256,orderedHash(chain));assert.equal(plan.applyAuthorized,false);
});
test('omitted, wrong bytes/hash, reversed or reordered base/tail fail closed',()=>{
 for(const args of [[base,null,true],[base,{...tail,sha256:'0'.repeat(64)},true],[base,{...tail,bytes:Buffer.from('BEGIN; COMMIT;')},true],[base.toReversed(),tail,true],[base.slice(1),tail,true]]) assert.throws(()=>selectFinancialHistoryChain(...args),/mismatch/u);
});
test('extension flag alone is not review authority: exact hash must be in hash-bound review once',()=>{
 const hash=orderedHash(chain),prefix='Financial history ordered chain SHA256:',correct=`${prefix} ${hash}`,wrong=`${prefix} ${'0'.repeat(64)}`;
 for(const ending of ['\n','\r\n']) assertFinancialReviewBinding(`Review${ending}${correct}${ending}`,hash);
 const rejected=[
  ['', 'missing'],[wrong,'wrong-only'],[`${prefix} ${BASE_CHAIN_SHA256}`,'base-only'],
  [correct+'\n'+wrong,'correct then conflicting'],[wrong+'\n'+correct,'conflicting then correct'],
  [correct+'\n'+correct,'duplicate correct'],
  [correct+'\n  '+correct,'indented duplicate last'],['  '+correct+'\n'+correct,'indented duplicate first'],
  [correct+'\n\t'+wrong,'indented conflicting last'],['\t'+wrong+'\n'+correct,'indented conflicting first'],
  ['  '+correct,'indented only'],[correct+' ','trailing space only'],
 ];
 for(const [review,label] of rejected)assert.throws(()=>assertFinancialReviewBinding(review,hash),/financial_chain_review_binding_missing/u,label);
 assert.equal(parseArguments(['--apply','--source-commit','1'.repeat(40),'--attestation-commit','2'.repeat(40),'--financial-history-extension']).financialHistoryExtension,true);
});
test('base-only cannot replay installed successor and partial residue cannot replay even with tail',async()=>{
 await assertInstalledFinancialHistoryPlan(clientFor(empty),base,false);
 await assertInstalledFinancialHistoryPlan(clientFor({...empty,observations:true,wrapper:true,reader:true,residue:true}),chain,true);
 await assert.rejects(assertInstalledFinancialHistoryPlan(clientFor({...empty,observations:true,wrapper:true,reader:true,residue:true}),base,false),/base_replay_rejected/u);
 for(const key of ['observations','wrapper','reader','residue']) await assert.rejects(assertInstalledFinancialHistoryPlan(clientFor({...empty,[key]:true}),chain,true),/partial_residue/u);
 await assert.rejects(assertInstalledFinancialHistoryPlan(clientFor(empty),base,true),/tail_required/u);
 await assert.rejects(assertInstalledFinancialHistoryPlan(clientFor({...empty,unknown_successor:true}),chain,true),/unknown_research/u);
});
test('missing/ambiguous state and any failed postcondition reject',async()=>{
 await assert.rejects(assertInstalledFinancialHistoryPlan(clientFor(null),chain,true),/state_unavailable/u);
 for(const key of Object.keys(good)) await assert.rejects(verifyFinancialHistoryPostconditions({query:async()=>({rows:[{result:{...good,[key]:false}}]})}),/postcondition_failed/u);
});
function transactionClient({busy=false,fail=false,disconnect=false,state=empty}={}) {
 const calls=[];let writes=0;return {calls,get writes(){return writes;},query:async sql=>{
  calls.push(sql);
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:!busy}]};
  if(sql.includes(' AS observations'))return {rows:[state]};
  if(sql.includes(' AS superseded'))return {rows:[{superseded:false}]};
  if(sql.trim()==='SELECT 42;') {writes++;if(fail)throw new Error(disconnect?'socket_disconnected':'forced_failure');}
  if(sql==='ROLLBACK')writes=0;
  return {rows:[{result:{all:true}}]};},end:async()=>{calls.push('END_SESSION');if(disconnect)writes=0;}};
}
const smallPlan={migrations:[{relativePath:'fixture.sql',sha256:'0'.repeat(64),bytes:Buffer.from('BEGIN; SELECT 42; COMMIT;')}],chainSha256:'0'.repeat(64)};
test('busy guard performs no BEGIN/mutation and closes owned session',async()=>{
 const c=transactionClient({busy:true});await assert.rejects(applyReviewedMigrationPlanToClient(c,smallPlan,{}),/busy/u);
 assert.equal(c.writes,0);assert.ok(!c.calls.includes('BEGIN'));assert.equal(c.calls.at(-1),'END_SESSION');
});
test('installed successor guard runs under lock+BEGIN before any base mutation',async()=>{
 const c=transactionClient({state:{...empty,observations:true,wrapper:true,reader:true,residue:true}});
 await assert.rejects(applyReviewedMigrationPlanToClient(c,smallPlan,{}),/base_replay_rejected/u);
 assert.equal(c.writes,0);assert.ok(c.calls.indexOf('BEGIN')<c.calls.findIndex(x=>x.includes(' AS observations')));assert.ok(c.calls.includes('ROLLBACK'));
});
test('one shared transaction strips inner controls and commits after verification',async()=>{
 const c=transactionClient();await applyReviewedMigrationPlanToClient(c,smallPlan,{});
 assert.equal(c.calls.filter(x=>x==='BEGIN').length,1);assert.equal(c.calls.filter(x=>x==='COMMIT').length,1);
 assert.ok(c.calls.indexOf('COMMIT')>c.calls.findIndex(x=>x.includes("'v314Diagnostics'")));assert.equal(c.writes,1);
});
test('forced failure and disconnect attempt rollback, do not commit, retain original error',async()=>{
 for(const disconnect of [false,true]){const c=transactionClient({fail:true,disconnect});await assert.rejects(applyReviewedMigrationPlanToClient(c,smallPlan,{}),disconnect?/socket_disconnected/u:/forced_failure/u);assert.ok(c.calls.includes('ROLLBACK'));assert.ok(!c.calls.includes('COMMIT'));assert.equal(c.writes,0);assert.equal(c.calls.at(-1),'END_SESSION');}
});
test('postcondition failure rolls back already issued SQL and session failure preserves the primary failure',async()=>{
 const c=transactionClient();const query=c.query;c.query=async sql=>sql.includes("'v314Diagnostics'")?{rows:[{result:{all:false}}]}:query(sql);
 await assert.rejects(applyReviewedMigrationPlanToClient(c,smallPlan,{}),/migration_postcondition_failed/u);assert.equal(c.writes,0);assert.ok(c.calls.includes('ROLLBACK'));assert.ok(!c.calls.includes('COMMIT'));
 const broken=transactionClient({fail:true});broken.end=async()=>{throw new Error('cleanup_failure');};
 await assert.rejects(applyReviewedMigrationPlanToClient(broken,smallPlan,{}),/forced_failure/u);
});
test('unbound extension cannot gain CLI authority and apply uses guarded exact review before connection',()=>{
 const source=fs.readFileSync('scripts/opportunity-v3/apply-reviewed-migrations.mjs','utf8');
 assert.ok(source.indexOf('resolveReviewedRuntimeRelease({')<source.indexOf('assertFinancialReviewBinding(review,chainSha256)'));
 assert.ok(source.indexOf('const plan=reviewedMigrationPlan(options)')<source.indexOf('const client=new Client'));
 assert.ok(source.indexOf('assertInstalledFinancialHistoryPlan(client,plan.migrations')<source.indexOf('for(const migration of plan.migrations)'));
 assert.equal(parseArguments(['--apply','--source-commit','1'.repeat(40),'--attestation-commit','2'.repeat(40)]).financialHistoryExtension,undefined);
});

test('installed function body fingerprints bind complete pinned SQL bodies, not marker strings alone',()=>{
 const sql=tail.bytes.toString('utf8');const helper=fs.readFileSync('scripts/opportunity-v3/financial-history-install-guard.mjs','utf8');
 const bodies=[...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/gu)];
 assert.equal(bodies.length,3);for(const match of bodies) assert.ok(helper.includes(createHash('sha256').update(match[2]).digest('hex')),match[1]);
});

test('exact observed catalog rejects every function binding, schema/index/trigger field drift',()=>{
 assertFinancialHistoryCatalog(FINANCIAL_HISTORY_EXPECTED_CATALOG);
 const mutate=run=>{const c=structuredClone(FINANCIAL_HISTORY_EXPECTED_CATALOG);run(c);assert.throws(()=>assertFinancialHistoryCatalog(c),/postcondition_failed/u);};
 for(let i=0;i<FINANCIAL_HISTORY_EXPECTED_CATALOG.functions.length;i++){
  mutate(c=>c.functions[i].config=['search_path=public']);mutate(c=>c.functions[i].securityDefiner=!c.functions[i].securityDefiner);
  mutate(c=>c.functions[i].owner='service_role');mutate(c=>c.functions[i].bodySha256='0'.repeat(64));
  mutate(c=>c.functions[i].acl.push({grantee:'PUBLIC',privilege:'EXECUTE',grantable:false}));
 }
 for(let i=0;i<2;i++){
  for(const key of ['valid','ready','live'])mutate(c=>c.indexes[i][key]=false);
  mutate(c=>c.indexes.splice(i,1));mutate(c=>c.indexes[i].definition+=' WHERE true');
 }
 mutate(c=>c.observation.columns.pop());mutate(c=>c.observation.columns[1].notNull=false);
 mutate(c=>c.observation.columns[2].type='varchar');mutate(c=>c.observation.columns[0].default=null);
 for(let i=0;i<7;i++)mutate(c=>c.observation.constraints.splice(i,1));
 mutate(c=>c.observation.triggers[0].type=25);mutate(c=>c.observation.triggers[0].enabled='D');
 mutate(c=>c.observation.rls=false);mutate(c=>c.observation.acl.push({grantee:'service_role',privilege:'INSERT',grantable:false}));
});
test('catalog private predecessor full body originates in the unchanged recollection migration',()=>{
 const sql=fs.readFileSync('migrations/20260816_financial_fact_recollection_idempotency_v3_16_16.sql','utf8');
 const body=sql.match(/AS \$function\$([\s\S]*?)\$function\$;/u)?.[1];assert.ok(body);
 assert.equal(FINANCIAL_HISTORY_EXPECTED_CATALOG.functions.find(x=>x.name==='append_financial_fact_pre_history_v1').bodySha256,createHash('sha256').update(body).digest('hex'));
});

test('immutable trigger dependency body originates in unchanged base SQL and stays security invoker',()=>{
 const sql=fs.readFileSync('migrations/20260724_source_led_opportunity_engine_v3.sql','utf8');
 const body=sql.match(/CREATE OR REPLACE FUNCTION legacy_correctness_immutable_v3_11\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/u)?.[1];assert.ok(body);
 const functionRow=FINANCIAL_HISTORY_EXPECTED_CATALOG.functions.find(x=>x.name==='legacy_correctness_immutable_v3_11');
 assert.equal(functionRow.bodySha256,createHash('sha256').update(body).digest('hex'));assert.equal(functionRow.securityDefiner,false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readDiscoveryFrozenSnapshot, type DiscoverySnapshotClient } from './discovery-frozen-snapshot-reader.ts';
import { fixture } from './discovery-frozen-snapshot-fixture.test-helper.ts';
const relations: Record<string,string>={revisions:'source_document_revisions_v3',sourceAuthorities:'source_identity_authorities_v3',publishers:'publisher_verification_authorities_v3',registry:'source_revision_family_registry_v3',verifications:'source_publication_verifications_v3',manifests:'opportunity_manifests_v3',manifestRows:'opportunity_manifest_rows_v3'};
function mock(options: {over?:boolean;aggregate?:boolean;bytes?:boolean;missing?:boolean;ambiguous?:boolean;truncated?:boolean;wrongSnapshot?:boolean;fail?:boolean;badVisibility?:boolean;badIsolation?:boolean}={}) {
 const x=fixture(),calls:{sql:string;values?:unknown[]}[]=[], witness={isolation:'repeatable read',read_only:'on',snapshot_id:'1:2:',snapshot_at:'2026-10-09T00:00:00.123456Z'};let witnesses=0,closed=false;
 const client: DiscoverySnapshotClient={connect:async()=>{calls.push({sql:'CONNECT'});},end:async()=>{closed=true;calls.push({sql:'END'});},query:async(sql,values)=>{
  calls.push({sql,values});if(options.fail && sql.includes('opportunity_runs'))throw Error('PRIVATE_DB_SECRET');
  if(sql.includes('row_security_active'))return {rows:[{relations:9,rls_active:options.badVisibility??false}]};
  if(sql.includes('pg_current_snapshot'))return {rows:[{...witness,isolation:options.badIsolation?'read committed':witness.isolation,snapshot_id:options.wrongSnapshot&&witnesses++?'2:3:':witness.snapshot_id}]};
  if(sql.includes('FROM public.opportunity_runs'))return {rows:options.missing?[]:options.ambiguous?[x.run,x.run]:[x.run]};
  if(sql.includes('FROM public.opportunity_run_manifest_inputs'))return {rows:[x.publisher_manifest_input]};
  for(const [key,relation] of Object.entries(relations))if(sql.includes(`FROM public.${relation}`)) {
   const rows=x.tables[key as keyof typeof x.tables];
   if(sql.startsWith('SELECT count'))return {rows:[{exact_count:String(options.over?4097:options.aggregate?3000:rows.length),bytes:String(options.bytes?4194305:100)}]};
   return {rows:options.truncated&&key==='revisions'?[]:rows};
  }return {rows:[]};}};
 return {client,calls,get closed(){return closed;}};
}
test('fixed RR/RO query order, sole UUID parameters, exact populations and private packet never escapes',async()=>{
 const m=mock();const a=await readDiscoveryFrozenSnapshot(m.client,fixture().run.run_id);assert.equal(a.status,'projected');assert.equal(a.projection?.bindings.length,1);assert.equal(a.projection?.live_population_verified,false);assert.equal(a.projection?.investment_admission,false);
 assert.deepEqual(m.calls.slice(0,4).map(c=>c.sql),['CONNECT','BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',"SET LOCAL statement_timeout='2000ms'","SET LOCAL lock_timeout='500ms'"]);
 assert.deepEqual(m.calls.slice(-2).map(c=>c.sql),['ROLLBACK','END']);assert.equal(m.closed,true);
 assert.ok(!JSON.stringify(a).includes('approving_principal_id'));assert.ok(!JSON.stringify(a).includes('retained-profile'));
 const firstPopulation=m.calls.findIndex(c=>c.sql.includes(' LIMIT 4097'));assert.equal(m.calls.slice(0,firstPopulation).filter(c=>c.sql.startsWith('SELECT count(*)::text AS exact_count')).length,7);
 for(const c of m.calls)if(c.values)assert.equal(c.values.length,1);
 const run=m.calls.find(c=>c.sql.includes('FROM public.opportunity_runs'));assert.deepEqual(run?.values,[fixture().run.run_id]);
 assert.ok(m.calls.filter(c=>c.sql.includes('FROM public.source_document_revisions_v3')).every(c=>!c.sql.includes(' WHERE ')));
});
for(const option of ['over','aggregate','bytes'] as const)test(`${option} bound rejects before any population fetch`,async()=>{
 const m=mock({[option]:true});const a=await readDiscoveryFrozenSnapshot(m.client,fixture().run.run_id);assert.equal(a.reason,'population_bound');assert.equal(a.projection,null);assert.ok(!m.calls.some(c=>c.sql.includes('LIMIT 4097')));assert.equal(m.closed,true);
});
for(const [option,reason] of [['missing','run_missing'],['ambiguous','run_ambiguous'],['truncated','population_incomplete'],['wrongSnapshot','snapshot_changed'],['badVisibility','population_visibility_unknown'],['badIsolation','snapshot_not_readonly'],['fail','read_failed']] as const)test(`${option} has no false success, sanitized error and confirmed cleanup`,async()=>{
 const m=mock({[option]:true});const a=await readDiscoveryFrozenSnapshot(m.client,fixture().run.run_id);assert.equal(a.reason,reason);assert.equal(a.projection,null);assert.equal(a.cleanup,'confirmed');assert.ok(!JSON.stringify(a).includes('PRIVATE_DB_SECRET'));
});
test('invalid UUID does no I/O; owned client cannot be reused',async()=>{
 const m=mock();assert.equal((await readDiscoveryFrozenSnapshot(m.client,'invalid')).reason,'invalid_run');assert.equal(m.calls.length,0);
 await readDiscoveryFrozenSnapshot(m.client,fixture().run.run_id);const n=m.calls.length;assert.equal((await readDiscoveryFrozenSnapshot(m.client,fixture().run.run_id)).reason,'client_already_owned');assert.equal(m.calls.length,n);
});
test('database timestamps are requested as fixed UTC microsecond text, never JS Date',async()=>{
 const m=mock();const a=await readDiscoveryFrozenSnapshot(m.client,fixture().run.run_id);assert.equal(a.projection?.source_cutoff,'2026-10-08T12:00:00.123456Z');assert.ok(m.calls.some(c=>c.sql.includes('HH24:MI:SS.US')));assert.ok(m.calls.some(c=>c.sql.includes("AT TIME ZONE 'UTC'")));
});

test('primary DB failure survives failed cleanup without exposing either private error',async()=>{
 const m=mock({fail:true});m.client.end=async()=>{throw Error('PRIVATE_CLOSE_ERROR');};const a=await readDiscoveryFrozenSnapshot(m.client,fixture().run.run_id);assert.equal(a.reason,'read_failed');assert.equal(a.cleanup,'failed');assert.ok(!JSON.stringify(a).includes('PRIVATE'));
});
test('stalled owned end returns bounded pending cleanup and cannot report a successful read',{timeout:12000},async()=>{
 const m=mock();m.client.end=()=>new Promise(()=>{});const start=performance.now();const a=await readDiscoveryFrozenSnapshot(m.client,fixture().run.run_id);assert.equal(a.status,'unsupported');assert.equal(a.projection,null);assert.equal(a.cleanup,'pending');assert.equal(a.reason,'cleanup_unconfirmed');assert.ok(performance.now()-start>=9500);assert.ok(performance.now()-start<11500);
});

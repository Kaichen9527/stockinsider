import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import{execFileSync}from'node:child_process';import{createRequire}from'node:module';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';import test from'node:test';
import{readDiscoveryFrozenSnapshot}from'../../web/src/lib/discovery-frozen-snapshot-reader.ts';
import{fixture}from'../../web/src/lib/discovery-frozen-snapshot-fixture.test-helper.ts';
import{canonicalJson,sha256Canonical}from'../../web/src/lib/opportunity-v3/canonical.ts';
const {Client}=createRequire(import.meta.url)('pg'),sha=b=>createHash('sha256').update(b).digest('hex');
const root=path.resolve(import.meta.dirname,'../..'),artifacts=process.env.DISCOVERY_SNAPSHOT_ARTIFACTS;
assert.ok(artifacts&&path.isAbsolute(artifacts));fs.mkdirSync(artifacts,{mode:0o700});
const save=(n,v)=>fs.writeFileSync(path.join(artifacts,n),JSON.stringify(v,null,2)+'\n');
const id=n=>`00000000-0000-4000-8000-${n.toString().padStart(12,'0')}`;
test('real captured v3 coherent RR readonly discovery acquisition (synthetic data, no live approval)',async t=>{
 const bin=execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'si-discovery-')),data=path.join(dir,'pg'),port=56000+process.pid%1000;
 const config={host:dir,port,user:'postgres',database:'postgres'},clients=new Set();let running=false,w;
 const client=()=>{const c=new Client(config);clients.add(c);return c;};
 try {
  execFileSync(path.join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-instructions'],{stdio:'pipe'});
  execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(dir,'pg.log'),'-o',`-h '' -k ${dir} -p ${port}`,'-w','start'],{stdio:'pipe'});running=true;
  w=client();await w.connect();
  const gz=fs.readFileSync(path.join(root,'scripts/opportunity-v3/fixtures/vps-schema-20261011.sql.gz')),raw=gunzipSync(gz),boot=fs.readFileSync(path.join(root,'deployment/vps/bootstrap-stockinsider-postgres.sql'));
  assert.equal(sha(gz),'2e9fc2f8a795a13490c12a90a2d9c974e19c1e93f9593d443d834978e0a19c60');assert.equal(sha(raw),'a82e3b089ee0523a9de3b1a84c0e799d878fa47bb6ec892a51af8c8e037c3731');
  await w.query(boot.toString().replaceAll(/^\\set.*$/gm,''));await w.query('ALTER SCHEMA public RENAME TO fixture_bootstrap_public');await w.query('ALTER SCHEMA extensions RENAME TO fixture_bootstrap_extensions');
  const schema=raw.toString().replaceAll(/^\\(?:restrict|unrestrict).*$/gm,'').replace('CREATE SCHEMA extensions;','ALTER SCHEMA fixture_bootstrap_extensions RENAME TO extensions;');await w.query(schema);
  save('restore-provenance.json',{gzipSha:sha(gz),decodedSha:sha(raw),bootstrapSha:sha(boot),executedSchemaSha:sha(schema),onlyExistingRestoreRebase:true,shadowRelations:false,formalPeer:false,syntheticSeed:true});
  const x=fixture();
  const insert=async(table,row)=>{const keys=Object.keys(row);await w.query(`INSERT INTO public.${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>typeof row[k]==='object'&&row[k]!==null&&!Buffer.isBuffer(row[k])&&k!=='domains'?JSON.stringify(row[k]):row[k]));};
  await w.query('BEGIN');
  for(const n of [4,6])await insert('source_entities',{id:id(n),platform:'ptt',entity_type:n===4?'forum_user':'site',display_name:'Synthetic fixture only',source_key:'fixture-'+n});
  const source=x.tables.sourceAuthorities[0],publisher=x.tables.publishers[0];
  await insert('source_identity_authorities_v3',source);
  await insert('publisher_verification_authorities_v3',{...publisher,domains:['example.test']});
  await insert('source_revision_family_registry_v3',x.tables.registry[0]);
  await insert('source_document_revisions_v3',{...x.tables.revisions[0],raw_field_payload:[],raw_code_point_count:0,raw_field_payload_algorithm_version:'raw-field-payload-v3.0',ingestion_content_revision_sha256:'c'.repeat(64),canonical_content_algorithm_version:'canonical-content-v3.0'});
  const m=x.tables.manifests[0],payload=x.tables.manifestRows[0].payload_json,ph=sha256Canonical(payload),identity=x.tables.manifestRows[0].identity_key;
  const page=['opportunity-manifest-page-v3.3',m.manifest_kind,m.contract_version,x.run.source_cutoff,'rows',0,0,[[0,identity,'effective_active',payload]]];
  const header=[['rowCount',1],['sourceCutoff',x.run.source_cutoff]];
  await insert('opportunity_manifests_v3',{...m,header_canonical:Buffer.from(canonicalJson(header)),header_json:header,root_canonical:Buffer.from(canonicalJson(m.root_json)),created_at:m.recorded_at});
  await insert('opportunity_manifest_pages_v3',{page_id:id(10),manifest_id:m.manifest_id,section_key:'rows',page_ordinal:0,first_row_ordinal:0,row_count:1,first_identity:identity,last_identity:identity,page_canonical:Buffer.from(canonicalJson(page)),page_json:page,page_hash:sha256Canonical(page),recorded_at:m.recorded_at});
  await insert('opportunity_manifest_rows_v3',{...x.tables.manifestRows[0],page_id:id(10),payload_canonical:Buffer.from(canonicalJson(payload))});
  await insert('opportunity_runs',{...x.run,created_at:source.recorded_at,recorded_at:source.recorded_at,preparation_key:'1'.repeat(64),logical_key:'2'.repeat(64),attempt:1,mode:'source_scan',run_purpose:'ad_hoc_shadow',comparison_contract_key:'3'.repeat(64)});
  await insert('opportunity_run_manifest_inputs',x.publisher_manifest_input);
  await insert('source_publication_verifications_v3',x.tables.verifications[0]);await w.query('COMMIT');
  await t.test('nonempty complete run/manifest positive and exact microseconds, public flags stay false',async()=>{
   const a=await readDiscoveryFrozenSnapshot(client(),id(1));save('positive.json',a);assert.equal(a.status,'projected');assert.equal(a.projection.bindings.length,1);assert.equal(a.projection.source_cutoff,x.run.source_cutoff);assert.equal(a.projection.live_population_verified,false);assert.equal(a.projection.investment_admission,false);assert.equal(a.cleanup,'confirmed');assert.ok(Object.values(a.snapshot.counts).every(n=>n===1));assert.ok(!JSON.stringify(a).includes('approving_principal_id'));
  });
  await t.test('missing run remains unsupported',async()=>{assert.equal((await readDiscoveryFrozenSnapshot(client(),id(99))).reason,'run_missing');});
  await t.test('real ambiguous input and incomplete manifest reject without inventing bindings',async()=>{
   await w.query('BEGIN');
   await insert('opportunity_manifests_v3',{manifest_id:id(31),manifest_kind:m.manifest_kind,contract_version:m.contract_version,source_cutoff:x.run.source_cutoff,header_canonical:Buffer.from('[]'),header_json:[],status:'building'});
   for(const n of [35,36])await insert('opportunity_runs',{...x.run,run_id:id(n),created_at:source.recorded_at,recorded_at:source.recorded_at,preparation_key:sha256Canonical(['synthetic-preparation',n]),logical_key:sha256Canonical(['synthetic-logical',n]),attempt:1,mode:'source_scan',run_purpose:'ad_hoc_shadow',comparison_contract_key:'3'.repeat(64)});
   await insert('opportunity_run_manifest_inputs',{...x.publisher_manifest_input,run_id:id(35),manifest_id:id(31)});
   await insert('opportunity_run_manifest_inputs',{...x.publisher_manifest_input,run_id:id(36)});
   await insert('opportunity_run_manifest_inputs',{...x.publisher_manifest_input,run_id:id(36),manifest_id:id(31),ordinal:1});await w.query('COMMIT');
   const ambiguous=await readDiscoveryFrozenSnapshot(client(),id(36)),incomplete=await readDiscoveryFrozenSnapshot(client(),id(35));assert.equal(ambiguous.reason,'manifest_input_missing_or_ambiguous');assert.equal(incomplete.reason,'manifest_integrity_mismatch');assert.equal(incomplete.projection.bindings.length,0);save('manifest-negative.json',{ambiguous,incomplete});
  });
  await t.test('second connection commit inside counted read does not change RR population; next snapshot sees invalid/revoked head',async()=>{
   const c=client(),q=c.query.bind(c);let fired=false;
   c.query=async(...args)=>{const a=await q(...args);if(!fired&&typeof args[0]==='string'&&args[0].startsWith('SELECT count')&&args[0].includes('source_document_revisions_v3')){
    fired=true;await w.query('BEGIN');await insert('source_identity_authorities_v3',{...source,authority_id:id(21),status:'inactive',recorded_at:x.run.source_cutoff});
    await insert('source_document_revisions_v3',{...x.tables.revisions[0],revision_id:id(20),recorded_at:x.run.source_cutoff,acquisition_status:'required_field_missing',ingestion_canonical_content_hash_v3:null,raw_field_payload:null,raw_code_point_count:0,raw_field_payload_algorithm_version:'raw-field-payload-v3.0',ingestion_content_revision_sha256:null,canonical_content_algorithm_version:'canonical-content-v3.0',supersedes_revision_id:id(2)});await w.query('COMMIT');
   }return a;};
   const before=await readDiscoveryFrozenSnapshot(c,id(1));assert.equal(fired,true);assert.equal(before.projection.bindings.length,1);assert.equal(before.snapshot.counts.revisions,1);assert.equal(before.snapshot.counts.sourceAuthorities,1);
   const after=await readDiscoveryFrozenSnapshot(client(),id(1));assert.equal(after.snapshot.counts.revisions,2);assert.equal(after.snapshot.counts.sourceAuthorities,2);assert.equal(after.projection.bindings.length,0);assert.ok(after.projection.dispositions.some(d=>d.disposition==='latest_revision_not_complete'));save('coherent-two-snapshots.json',{before,after});
  });
  await t.test('actual PG read-only mutation rejected and rollback cleanup confirmed',async()=>{
   const c=client(),q=c.query.bind(c);let code;
   c.query=async(...args)=>{const a=await q(...args);if(args[0]==="SET LOCAL lock_timeout='500ms'")try{await q("INSERT INTO public.source_entities(id,platform) VALUES($1,'ptt')",[id(77)]);}catch(e){code=e.code;}return a;};
   const a=await readDiscoveryFrozenSnapshot(c,id(1));assert.equal(code,'25006');assert.equal(a.status,'unsupported');assert.equal(a.cleanup,'confirmed');assert.equal((await w.query('SELECT count(*) FROM public.source_entities WHERE id=$1',[id(77)])).rows[0].count,'0');save('readonly-mutation.json',{code,result:a});
  });
  await t.test('existing anon role with active RLS cannot masquerade as a complete population',async()=>{
   const c=client(),connect=c.connect.bind(c);c.connect=async()=>{await connect();await c.query('SET ROLE anon');};
   const a=await readDiscoveryFrozenSnapshot(c,id(1));assert.equal(a.reason,'population_visibility_unknown');assert.equal(a.projection,null);assert.equal(a.cleanup,'confirmed');save('rls-visibility-rejected.json',a);
  });
  await t.test('actual server disconnect never succeeds and closes owned client',async()=>{
   const c=client(),q=c.query.bind(c);let fired=false;
   c.query=async(...args)=>{if(!fired&&typeof args[0]==='string'&&args[0].includes('FROM public.opportunity_runs')){fired=true;await w.query('SELECT pg_terminate_backend($1)',[c.processID]);}return q(...args);};c.on('error',()=>{});
   const a=await readDiscoveryFrozenSnapshot(c,id(1));assert.equal(a.status,'unsupported');assert.equal(a.projection,null);save('disconnect.json',a);
  });
  await t.test('actual PG statement timeout is bounded, sanitized and rolled back',async()=>{
   const c=client(),q=c.query.bind(c);let code;const start=performance.now();
   c.query=async(...args)=>{const a=await q(...args);if(args[0]==="SET LOCAL lock_timeout='500ms'")try{await q('SELECT pg_sleep(3)');}catch(e){code=e.code;throw e;}return a;};
   const a=await readDiscoveryFrozenSnapshot(c,id(1));assert.equal(code,'57014');assert.equal(a.status,'unsupported');assert.equal(a.cleanup,'confirmed');assert.ok(performance.now()-start<5000);save('statement-timeout.json',{code,elapsedMs:performance.now()-start,result:a});
  });
  await t.test('real retained registry above4096 is rejected before population transfer',async()=>{
   await w.query("INSERT INTO public.source_revision_family_registry_v3(source_key,revision_family_key,approved_source_identity_id,stable_connector_document_id) SELECT 'ptt',(md5(n::text)||md5('fixture'||n::text)),$1,'bounded-fixture-'||n FROM generate_series(1,4097) n",[id(4)]);
   const a=await readDiscoveryFrozenSnapshot(client(),id(1));assert.equal(a.reason,'population_bound');assert.equal(a.projection,null);save('over-cap.json',a);
  });
 }catch(e){save('failure.json',{message:e.message,code:e.code,detail:e.detail,stack:e.stack});throw e;}
 finally {for(const c of clients)try{await c.end();}catch{}if(running)execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe'});fs.rmSync(dir,{recursive:true,force:true});save('cleanup.json',{stopped:true,removed:true});}
});

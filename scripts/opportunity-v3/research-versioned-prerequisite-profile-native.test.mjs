import test from 'node:test';
import {readPrerequisiteState,applyVersionedPrerequisiteEngineering,PREREQUISITE_LOCK,PREREQUISITE_GRANT,canonical,stateDescriptor,assertPrerequisiteDescriptor} from './research-versioned-prerequisite-profile.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync}from'node:child_process';import {gunzipSync}from'node:zlib';import {createHash,randomUUID}from'node:crypto';import {createRequire}from'node:module';
import {MIGRATIONS,applyReviewedMigrationPlanToClient}from'./apply-reviewed-migrations.mjs';import{FINANCIAL_TAIL,selectFinancialHistoryChain,orderedHash}from'./financial-history-install-guard.mjs';import{OWNERSHIP_PRELUDE,makeFinancialExistingSchemaProfile}from'./financial-existing-schema-profile.mjs';import{ensureVpsRuntimeRole}from'./financial-vps-operator-action.mjs';import{financialOperatorActionIdentity}from'./financial-vps-operator-binding.mjs';import{loadPublicationTail}from'./research-publication-tail-extraction.mjs';import{applyPublicationTailToEngineeringClient}from'./research-publication-tail-atomic-client.mjs';
const {Client}=createRequire(import.meta.url)('pg'),root=path.resolve(import.meta.dirname,'../..'),out=process.env.RESEARCH_PREREQUISITE_PROFILE_ARTIFACTS;assert.ok(out&&path.isAbsolute(out));fs.mkdirSync(out,{mode:0o700});const sha=b=>createHash('sha256').update(b).digest('hex'),save=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n');
const load=p=>{const bytes=fs.readFileSync(path.join(root,p));return{relativePath:p,bytes,sha256:sha(bytes)}};const migrations=selectFinancialHistoryChain(MIGRATIONS.map(load),load(FINANCIAL_TAIL),true),plan={migrations,chainSha256:orderedHash(migrations),financialExistingSchemaProfile:makeFinancialExistingSchemaProfile(migrations,load(OWNERSHIP_PRELUDE)),operatorPrerequisite:financialOperatorActionIdentity()};
async function main(t){
 const bin=execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();assert.match(execFileSync(path.join(bin,'postgres'),['--version'],{encoding:'utf8'}),/17\.11/);const base=fs.mkdtempSync('/tmp/vp3profile-'),data=path.join(base,'pg'),port=58100+process.pid%400;let started=false,stage='initdb';const clients=new Set();let secure;
 const connect=async()=>{const c=new Client({host:base,port,user:'postgres',database:'postgres',statement_timeout:30000});c.on('error',e=>save('client-error.json',{code:e.code,message:e.message}));await c.connect();clients.add(c);return c;};const close=async c=>{await c.end();clients.delete(c);};
 const ledger=async c=>(await c.query("SELECT jsonb_build_object('preparations',(SELECT coalesce(jsonb_agg(to_jsonb(p)ORDER BY preparation_id),'[]')FROM research_input_preparations_v2 p),'revisions',(SELECT coalesce(jsonb_agg(to_jsonb(r)ORDER BY revision_id),'[]')FROM research_article_input_revisions_v2 r)) AS v")).rows[0].v;
 try{
  for(const p of ['/workspace','/tmp']){const s=fs.statfsSync(p);assert.ok(s.bavail*s.bsize>=8589934592);}
  execFileSync(path.join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-instructions']);execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(base,'pg.log'),'-o',`-h '' -k ${base} -p ${port}`,'-w','start']);started=true;
  let c=await connect();stage='captured restore';const gz=fs.readFileSync(path.join(root,'scripts/opportunity-v3/fixtures/vps-schema-20261011.sql.gz')),captured=gunzipSync(gz);assert.equal(sha(gz),'2e9fc2f8a795a13490c12a90a2d9c974e19c1e93f9593d443d834978e0a19c60');assert.equal(sha(captured),'a82e3b089ee0523a9de3b1a84c0e799d878fa47bb6ec892a51af8c8e037c3731');
  const bootstrap=fs.readFileSync(path.join(root,'deployment/vps/bootstrap-stockinsider-postgres.sql'),'utf8').replaceAll(/^\\set.*$/gm,'');await c.query(bootstrap);await c.query('ALTER SCHEMA public RENAME TO fixture_bootstrap_public;ALTER SCHEMA extensions RENAME TO fixture_bootstrap_extensions');await c.query(captured.toString().replaceAll(/^\\(?:restrict|unrestrict).*$/gm,'').replace('CREATE SCHEMA extensions;','ALTER SCHEMA fixture_bootstrap_extensions RENAME TO extensions;'));await close(c);
  stage='actual50';c=await connect();await applyReviewedMigrationPlanToClient(c,plan,{privateVpsPeerOperator:true,bootstrapVpsRuntimeRole:true,financialExistingSchemaProfile:true},{operatorPrerequisiteExecutor:async client=>({transport:{engineeringOnly:true,privatePeerTransportVerified:false,effectiveHbaVerified:false},role:await ensureVpsRuntimeRole(client)})});clients.delete(c);
  stage='actual26';c=await connect();await applyPublicationTailToEngineeringClient(c,loadPublicationTail(root));clients.delete(c);save('prerequisites.json',{actual50:true,actual26:true,capturedSha:sha(captured),syntheticBootstrapRoles:true,formalPeer:false});
  c=await connect();stage='candidate migration';await c.query(fs.readFileSync(path.join(root,'migrations/20261014_research_versioned_input_candidate_v3.sql'),'utf8'));
  await close(c);

  const observer=await connect();const baseline=await readPrerequisiteState(observer);save('native-predecessor.json',stateDescriptor(baseline));
  const same=async expected=>assert.equal(canonical(await readPrerequisiteState(observer)),canonical(expected));
  const check=async(name,fn)=>{let fail;await t.test(name,async()=>{try{await fn()}catch(e){fail=e;save('case-failure.json',{name,message:e.message,code:e.code});throw e;}});if(fail)throw fail;};
  await check('full original predecessor descriptor accepted',async()=>assert.equal(assertPrerequisiteDescriptor(stateDescriptor(baseline)),'predecessor'));
  await check('partial one-owner SAVEPOINT residue rejected before helper grant, whole rollback',async()=>{
   const w=await connect(),real=w.query.bind(w);let grants=0;
   w.query=async(q,...args)=>{if(q===PREREQUISITE_GRANT)grants++;const result=await real(q,...args);if(q==='BEGIN ISOLATION LEVEL READ COMMITTED')await real('SAVEPOINT partial_fixture; GRANT USAGE ON SCHEMA public TO research_input_preparation_owner_v2');return result;};
   await assert.rejects(applyVersionedPrerequisiteEngineering(w),/profile_mismatch/);clients.delete(w);assert.equal(grants,0);await same(baseline);
  });
  await check('competing shared session lock rejects before BEGIN',async()=>{
   const holder=await connect();assert.equal((await holder.query(PREREQUISITE_LOCK)).rows[0].locked,true);const w=await connect(),real=w.query.bind(w),calls=[];w.query=async(q,...args)=>{calls.push(q);return real(q,...args)};
   try{await assert.rejects(applyVersionedPrerequisiteEngineering(w),/busy/);assert.ok(!calls.some(q=>q.startsWith('BEGIN')));}finally{clients.delete(w);await close(holder);}await same(baseline);save('busy-query-trace.json',calls);
  });
  await check('forced error after exact grant restores role/schema/object authority',async()=>{
   const w=await connect(),real=w.query.bind(w);let changed=false;w.query=async(q,...args)=>{const result=await real(q,...args);if(q===PREREQUISITE_GRANT){changed=true;save('forced-in-transaction.json',stateDescriptor(await readPrerequisiteState({query:real})));throw Error('intentional_after_grant');}return result;};
   await assert.rejects(applyVersionedPrerequisiteEngineering(w),/intentional_after_grant/);clients.delete(w);assert.equal(changed,true);await same(baseline);
  });
  await check('real socket disconnect after exact grant rolls back on server',async()=>{
   const w=await connect(),pid=w.processID,real=w.query.bind(w);let changed=false;w.query=async(q,...args)=>{const result=await real(q,...args);if(q===PREREQUISITE_GRANT){changed=true;w.connection.stream.destroy();throw Error('intentional_socket_disconnect');}return result;};
   await assert.rejects(applyVersionedPrerequisiteEngineering(w),/intentional_socket_disconnect/);clients.delete(w);assert.equal(changed,true);
   let gone=false;for(let i=0;i<50;i++){gone=(await observer.query('SELECT NOT EXISTS(SELECT FROM pg_stat_activity WHERE pid=$1) gone',[pid])).rows[0].gone;if(gone)break;await new Promise(r=>setTimeout(r,20));}assert.equal(gone,true);await same(baseline);save('disconnect.json',{writerPid:pid,backendGone:gone,fullStateRestored:true});
  });
  await check('exact two-owner delta COMMIT with fixed grantor and all other authority unchanged',async()=>{
   const w=await connect();const r=await applyVersionedPrerequisiteEngineering(w);clients.delete(w);assert.equal(r.status,'committed');save('commit.json',r);const after=await readPrerequisiteState(observer);assert.equal(assertPrerequisiteDescriptor(stateDescriptor(after)),'successor');assert.equal(canonical(after.details),canonical(baseline.details));save('native-successor.json',stateDescriptor(after));
  });
  const successor=await readPrerequisiteState(observer);
  await check('strict successor replay is no-op with zero GRANT',async()=>{
   const w=await connect(),real=w.query.bind(w),calls=[];w.query=async(q,...args)=>{calls.push(q);return real(q,...args)};const r=await applyVersionedPrerequisiteEngineering(w);clients.delete(w);assert.equal(r.status,'exact_noop');assert.ok(!calls.includes(PREREQUISITE_GRANT));await same(successor);save('replay.json',{result:r,queries:calls});
  });
  stage='profile matrix complete';save('profile-matrix-summary.json',{checks:7,profileOnly:true,fullProtocolPassed:false});

 }catch(e){save('failure.json',{stage,code:e.code,message:e.message,where:e.where});throw e;}finally{for(const c of clients)try{await close(c)}catch{};if(started)execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);if(fs.existsSync(path.join(base,'pg.log')))fs.copyFileSync(path.join(base,'pg.log'),path.join(out,'postgres.log'));fs.rmSync(base,{recursive:true,force:true});save('cleanup.json',{stopped:started,removed:base,stage});}}
await test('local captured50+26+candidate prerequisite matrix',main);

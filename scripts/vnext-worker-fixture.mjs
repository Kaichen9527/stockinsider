/** New worker fixture: exact approved engineering prefix APIs, no old test entry import.
 * Synthetic isolated network-none VM lab only; no production/HBA/peer claim. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { MIGRATIONS, applyReviewedMigrationPlanToClient } from './opportunity-v3/apply-reviewed-migrations.mjs';
import { FINANCIAL_TAIL, selectFinancialHistoryChain, orderedHash } from './opportunity-v3/financial-history-install-guard.mjs';
import { OWNERSHIP_PRELUDE, makeFinancialExistingSchemaProfile } from './opportunity-v3/financial-existing-schema-profile.mjs';
import { ensureVpsRuntimeRole } from './opportunity-v3/financial-vps-operator-action.mjs';
import { financialOperatorActionIdentity } from './opportunity-v3/financial-vps-operator-binding.mjs';
import { loadPublicationTail } from './opportunity-v3/research-publication-tail-extraction.mjs';
import { applyPublicationTailToEngineeringClient } from './opportunity-v3/research-publication-tail-atomic-client.mjs';
const { Client } = createRequire(import.meta.url)('pg');
export const hash = value => createHash('sha256').update(value).digest('hex');
export async function workerFixture() {
 const container=process.env.VNEXT_TEST_CONTAINER, socketParent=process.env.VNEXT_WORKER_SOCKET_PARENT, output=process.env.VNEXT_NATIVE_ARTIFACTS;
 if(!/^stockinsider-vnext-oct22-worker-[0-9]{2}$/u.test(container||'') || !/^\/tmp\/stockinsider-vnext-oct22-private\/worker-pg-socket-[0-9]{2}$/u.test(socketParent||'') || !output || !path.isAbsolute(output) || fs.existsSync(output))throw Error('fresh_owned_worker_fixture_required');
 fs.mkdirSync(output,{mode:0o700});
 const saved=(name,value)=>fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify(value,null,2)+'\n',{mode:0o600});
 const inspected=spawnSync('docker',['--host=unix:///var/run/docker.sock','inspect',container],{encoding:'utf8'});assert.equal(inspected.status,0);
 const identity=JSON.parse(inspected.stdout)[0];assert.equal(identity.Config.Labels['codex.task'],'stockinsider-vnext-oct22');assert.equal(identity.HostConfig.NetworkMode,'none');assert.deepEqual(identity.HostConfig.PortBindings,{});assert.equal(identity.HostConfig.Memory,1073741824);
 const clients=new Set(),events=[];
 const connect=async()=>{const c=new Client({host:path.join(socketParent,'socket'),user:'postgres',database:'vnext_worker',ssl:false,connectionTimeoutMillis:3000,statement_timeout:30000});await c.connect();clients.add(c);c.once('end',()=>clients.delete(c));return c;};
 const close=async c=>{if(clients.has(c))await c.end();};
 let writer=await connect();const observer=await connect();assert.notEqual(writer.processID,observer.processID);
 const load=relativePath=>{const bytes=fs.readFileSync(relativePath);return {relativePath,bytes,sha256:hash(bytes)};};
 const snapshot=async()=>{
  await observer.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{const tables=(await observer.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);const result={};
   for(const name of tables){assert.match(name,/^[a-z0-9_]+$/u);const rows=(await observer.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM public.${name} t`)).rows[0].rows;result[name]={rows,count:rows.length,sha256:hash(JSON.stringify(rows))};}
   await observer.query('COMMIT');return result;
  }catch(error){await observer.query('ROLLBACK');throw error;}
 };
 const rpc=async(principal,action,body,provider=false,expected)=>{
  const c=await connect();try{await c.query('SET ROLE service_role');const ready=new Promise(resolve=>c.connection.once('readyForQuery',m=>resolve(m.status)));
   const sql=provider?'SELECT public.vnext_provider_command_v1($1,$2,$3::jsonb) AS result':'SELECT public.vnext_command_v1($1,$2,$3::jsonb) AS result';
   const [query,settlement]=await Promise.allSettled([c.query(sql,[principal,action,JSON.stringify(body)]),ready]);assert.equal(settlement.status,'fulfilled');assert.equal(settlement.value,'I');
   events.push({action,provider,querySettled:true,ready:settlement.value,pid:c.processID,...(query.status==='rejected'?{code:query.reason.code,message:query.reason.message}:{committed:true})});
   if(expected){assert.equal(query.status,'rejected');assert.equal(query.reason.code,expected instanceof RegExp?'P0001':expected.code);assert.match(query.reason.message,expected instanceof RegExp?expected:expected.message);return;}
   if(query.status==='rejected')throw query.reason;return query.value.rows[0].result;
  }finally{await close(c);}
 };
 const fixture={connect,close,observer,save:saved,snapshot,rpc,events,output,get writer(){return writer;},
  async install(){
   assert.deepEqual((await writer.query('SELECT datcollate,datctype FROM pg_database WHERE datname=current_database()')).rows[0],{datcollate:'C.UTF-8',datctype:'C.UTF-8'});
   const gz=fs.readFileSync('scripts/opportunity-v3/fixtures/vps-schema-20261011.sql.gz'),captured=gunzipSync(gz);assert.equal(hash(gz),'2e9fc2f8a795a13490c12a90a2d9c974e19c1e93f9593d443d834978e0a19c60');assert.equal(hash(captured),'a82e3b089ee0523a9de3b1a84c0e799d878fa47bb6ec892a51af8c8e037c3731');
   const bootstrap=load('deployment/vps/bootstrap-stockinsider-postgres.sql');await writer.query(bootstrap.bytes.toString().replaceAll(/^\\set.*$/gm,''));
   await writer.query('ALTER SCHEMA public RENAME TO fixture_bootstrap_public; ALTER SCHEMA extensions RENAME TO fixture_bootstrap_extensions');
   const restored=captured.toString().replaceAll(/^\\(?:restrict|unrestrict).*$/gm,'').replace('CREATE SCHEMA extensions;','ALTER SCHEMA fixture_bootstrap_extensions RENAME TO extensions;');await writer.query(restored);
   await close(writer);writer=await connect();
   const migrations=selectFinancialHistoryChain(MIGRATIONS.map(load),load(FINANCIAL_TAIL),true);
   const plan={migrations,chainSha256:orderedHash(migrations),financialExistingSchemaProfile:makeFinancialExistingSchemaProfile(migrations,load(OWNERSHIP_PRELUDE)),operatorPrerequisite:financialOperatorActionIdentity()};
   const financial=await applyReviewedMigrationPlanToClient(writer,plan,{privateVpsPeerOperator:true,bootstrapVpsRuntimeRole:true,financialExistingSchemaProfile:true,sourceCommit:null,attestationCommit:null},{operatorPrerequisiteExecutor:async c=>({transport:{engineeringOnly:true,privatePeerTransportVerified:false,effectiveHbaVerified:false},role:await ensureVpsRuntimeRole(c)})});clients.delete(writer);saved('financial-prefix',financial);writer=await connect();
   saved('publication-prefix',await applyPublicationTailToEngineeringClient(writer,loadPublicationTail(process.cwd())));clients.delete(writer);writer=await connect();
   for(const file of ['migrations/20261022_stockinsider_vnext_20_v1.sql','migrations/20261022_vnext_legacy_mode_fence_v1.sql','migrations/20261022_vnext_provider_worker_v1.sql']){const source=load(file);await writer.query(source.bytes.toString());saved(path.basename(file),{sha256:source.sha256,bytes:source.bytes.length});}
   await writer.query('SELECT public.vnext_set_mode_v1(true)');saved('installed-state',await snapshot());
  },
  async finish(){saved('query-events',events);saved('final-state',await snapshot());const pids=[...clients].map(c=>c.processID);for(const c of [...clients])await close(c);const check=await connect();const active=(await check.query('SELECT pid FROM pg_stat_activity WHERE pid=ANY($1::int[])',[pids])).rows;assert.deepEqual(active,[]);await close(check);saved('cleanup',{trackedClientsSettled:clients.size===0,priorBackendPids:pids,priorBackendsAbsent:true,clusterRetained:true,externalStopRequired:true});}
 };return fixture;
}

/** Actual future fresh installer/current-read probes only. No old entry import,
 * fabricated publication, time travel, namespace permission or synthetic approval.
 * Full published rebase across naturally completed sessions remains distinct. */
import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function installPublishedTargetReadCandidate(x){
 assert.notEqual(x.writer.processID,x.observer.processID);
 const idle=async c=>{let readyListener,errorListener,endListener;const ready=new Promise((resolve,reject)=>{readyListener=m=>resolve(m.status);errorListener=reject;endListener=()=>reject(Error('owned_action_client_ended'));c.connection.once('readyForQuery',readyListener);c.once('error',errorListener);c.once('end',endListener);});try{const [q,r]=await Promise.allSettled([c.query(''),ready]);if(q.status==='rejected')throw q.reason;if(r.status==='rejected')throw r.reason;assert.equal(r.value,'I');}finally{c.connection.off('readyForQuery',readyListener);c.off('error',errorListener);c.off('end',endListener);}};
 await idle(x.writer);await idle(x.observer);
 const profile=JSON.parse(fs.readFileSync('scripts/opportunity-v3/vnext-published-target-read-profile-v1.json','utf8')),bytes=fs.readFileSync(profile.migration);assert.equal(sha(bytes),profile.migrationSha256);
 const catalog=/catalog_sql constant text:=\$catalog\$([\s\S]*?)\$catalog\$/u.exec(bytes.toString())[1];assert.equal(sha(catalog),profile.catalogQuerySha256);
 const signatures=profile.modifiedRoutines.map(r=>r.signature);
 const snapshot=async()=>{await x.observer.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{const routines=(await x.observer.query("SELECT oid,oid::regprocedure::text AS signature,to_jsonb(p) AS metadata,encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS hash FROM pg_proc p WHERE pronamespace='public'::regnamespace ORDER BY oid")).rows;const modified=signatures.map(s=>{const r=routines.find(r=>r.signature===s.replace('public.',''));assert.ok(r);return r.oid;});const state=(await x.observer.query(catalog,[modified,[],'{}'])).rows[0];await x.observer.query('COMMIT');return {routines,state};}catch(error){try{await x.observer.query('ROLLBACK');}catch(rollbackError){Object.assign(error,{rollbackError});}throw error;}};
 const before=await snapshot();for(const r of profile.modifiedRoutines)assert.equal(before.routines.find(v=>v.signature===r.signature.replace('public.','')).hash,r.predecessorBodySha256);
 try{await x.writer.query(bytes.toString());}catch(error){try{await x.writer.query('ROLLBACK');}catch(rollbackError){Object.assign(error,{rollbackError});}x.save('published-target-read-install-red',{code:error.code,message:error.message,sourceSha256:sha(bytes),before});throw error;}
 await idle(x.writer);
 const after=await snapshot();assert.deepEqual(after.state,before.state);assert.equal(after.routines.length,before.routines.length);
 for(const r of before.routines){const current=after.routines.find(v=>v.oid===r.oid),omit=v=>{const m={...v.metadata};delete m.prosrc;return m;};assert.ok(current);assert.deepEqual(omit(current),omit(r));const declared=profile.modifiedRoutines.find(d=>d.signature.replace('public.','')===r.signature);assert.equal(current.hash,declared?declared.successorBodySha256:r.hash);}
 let repeat;try{await x.writer.query(bytes.toString());}catch(error){repeat=error;}finally{await x.writer.query('ROLLBACK');}await idle(x.writer);assert.equal(repeat?.code,'P0001');assert.equal(repeat.message,'vnext_target_read_predecessor_changed');assert.deepEqual(await snapshot(),after);
 const business=await x.snapshot();assert.equal(business.vnext_publications_v1.count,0,'no direct row insert or fabrication to manufacture published baseline');
 await x.observer.query('BEGIN READ ONLY');let read;try{await x.observer.query('SET LOCAL ROLE service_role');read=(await x.observer.query("SELECT public.vnext_read_v1('2409') AS value")).rows[0].value;await x.observer.query('ROLLBACK');}catch(error){try{await x.observer.query('ROLLBACK');}catch(rollbackError){Object.assign(error,{rollbackError});}throw error;}
 // mode may be disabled at this prefix; never turn it on merely for the probe.
 if(read!==null){assert.deepEqual(read.history,[]);assert.equal(read.targetAssessment,null);}
 assert.deepEqual(await x.snapshot(),business);
 x.save('published-target-read-installed',{sourceSha256:sha(bytes),before,after,repeat:{code:repeat.code,message:repeat.message},readonlyPid:x.observer.processID,writerPid:x.writer.processID,business,read,scope:'actual future first COMMIT/repeat rollback/full catalog and existing service-role read only; no actual published baseline/rebase/exit/race proof'});
 console.log('PUBLISHED_TARGET_INSTALL_SAFE '+JSON.stringify({modifiedBodies:2,newFunctions:0,newGrants:0,repeatRejected:true,wholeCatalogInvariant:true,readOnlyProbe:true,publishedBaseline:false,actualRebase:false}));
}

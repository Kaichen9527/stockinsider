// New isolated author-union native entry. No old test entry imports.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import{createHash,randomUUID}from'node:crypto';
import{withLegalVersionedFixture}from'./research-versioned-legal-fixture-helper.mjs';
import{readPrerequisiteState,stateDescriptor,canonical,digest,prerequisiteDescriptor}from'./research-versioned-prerequisite-profile.mjs';
import{nativeArticle}from'./research-v3-author-native-article-fixture.mjs';
import{createV3AuthorArticleComposition}from'../../web/src/lib/research-v3-author-result.ts';
import{createV3CashCitationConsumer}from'../../web/src/lib/research-v3-article-citations.ts';
import{createV3BusinessArticleValidator}from'../../web/src/lib/research-v3-business-article.ts';
import{resolveConfiguredResearchControllerPrincipals}from'../../web/src/lib/research-execution-binding.ts';
import{completeHash,completeCanonical}from'../../web/src/lib/research-v3-material-canonical.ts';
const hash=b=>createHash('sha256').update(b).digest('hex'),sqlPath='migrations/20261015_research_author_durable_union_candidate_v3.sql',sql=fs.readFileSync(sqlPath,'utf8');
const profile=JSON.parse(fs.readFileSync('docs/operations/2026-10-15/v3-author-durable-union/source-derived-profile.json'));
process.env.INTERNAL_API_KEY='synthetic-local-author-durable-native';process.env.RESEARCH_REVIEW_KEY='synthetic-local-independent-reviewer';
const identity=resolveConfiguredResearchControllerPrincipals();assert.equal(identity.ok,true);
const metadataQuery=`SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('identity',to_jsonb(p)-'prosrc','bodySha256',encode(sha256(convert_to(prosrc,'UTF8')),'hex'),'signature',p.oid::regprocedure::text) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','extensions')),'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_default_acl d)) value`;
async function installer({client:c,connect,close,save,setStage}){
 const observer=await connect();await observer.query('SET default_transaction_read_only=on');
 const ids={writer:(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid,observer:(await observer.query('SELECT pg_backend_pid() pid')).rows[0].pid,observerReadOnly:(await observer.query('SHOW transaction_read_only')).rows[0].transaction_read_only};assert.notEqual(ids.writer,ids.observer);assert.equal(ids.observerReadOnly,'on');save('installer-connections.json',ids);
 try{
  setStage('author union: actual pristine LOCAL predecessor and codec');
  const before=await readPrerequisiteState(observer),meta=(await observer.query(metadataQuery)).rows[0].value;
  save('installer-before-private.json',{state:before,metadata:meta});assert.deepEqual(stateDescriptor(before),prerequisiteDescriptor().successor);
  const codecs={};for(const key of ['namespace','catalog']){
   const js=canonical(before[key]),db=(await observer.query('SELECT research_observed_canonical_json_v1($1::jsonb) text',[JSON.stringify(before[key])])).rows[0].text;
   let first=-1;for(let i=0;i<Math.max(js.length,db.length);i++)if(js[i]!==db[i]){first=i;break;}
   codecs[key]={jsSha256:hash(js),dbSha256:hash(db),jsBytes:Buffer.byteLength(js),dbBytes:Buffer.byteLength(db),equal:js===db,firstDifferentCodeUnit:first};save('codec-'+key+'-private.json',{js,db});
  }save('installer-codecs.json',codecs);
  setStage('author union: original 619-line SQL first apply');
  try{await c.query(sql);}catch(error){
   save('installer-original-error.json',{code:error.code,message:error.message,where:error.where,position:error.position,sqlSha256:hash(sql)});
   await c.query('ROLLBACK');const after=await readPrerequisiteState(observer),afterMeta=(await observer.query(metadataQuery)).rows[0].value;
   save('installer-rejected-after-private.json',{state:after,metadata:afterMeta});assert.deepEqual(after,before);assert.deepEqual(afterMeta,meta);
   save('installer-rejected-witness.json',{sqlSha256:hash(sql),code:error.code,message:error.message,namespaceUnchanged:true,catalogUnchanged:true,objectOidsRolesAndMetadataUnchanged:true,defaultsUnchanged:true,codecs,actualCommit:false});throw error;
  }
  const after=await readPrerequisiteState(observer),afterMeta=(await observer.query(metadataQuery)).rows[0].value;save('installer-committed-after-private.json',{state:after,metadata:afterMeta});
  assert.ok(Object.values(codecs).every(v=>v.equal),'DB canonical must equal original JS codec');assert.deepEqual(after.details,before.details);assert.deepEqual(afterMeta.defaults,meta.defaults);
  const changed=[];for(let i=0;i<meta.functions.length;i++){const a=meta.functions[i],b=afterMeta.functions[i];assert.deepEqual(b.identity,a.identity);assert.equal(b.signature,a.signature);if(a.bodySha256!==b.bodySha256)changed.push(b);}
  assert.equal(changed.length,4);for(const f of profile.functions){const actual=afterMeta.functions.find(v=>v.signature.startsWith(f.name+'('));assert.ok(actual);assert.equal(actual.bodySha256,f.successorBodySha256);}
  const strip=s=>({...s,catalog:{...s.catalog,functions:[]},namespace:{...s.namespace,routines:[]}});assert.deepEqual(strip(after),strip(before));
  save('installer-commit-witness.json',{connections:ids,sqlSha256:hash(sql),codecs,changed:changed.map(v=>({signature:v.signature,bodySha256:v.bodySha256,oid:v.identity.oid})),metadataUnchanged:true,commitObserved:true});
  setStage('author union: installed first-only rejection');let code;try{await c.query(sql);assert.fail('installed migration accepted');}catch(error){code={code:error.code,message:error.message};assert.equal(error.code,'P0001');assert.equal(error.message,'author_union_predecessor_namespace');}finally{await c.query('ROLLBACK');}
  assert.deepEqual(await readPrerequisiteState(observer),after);save('installer-repeat-rejected.json',code);
 }finally{await close(observer);}
}
async function snapshot(x,label){
 const audit=await x.auditState(),ledger=await x.ledger(x.audit),author={};
 for(const table of ['research_author_assignments_v2','research_author_results_v2'])author[table]=(await x.audit.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') rows FROM public.${table} t`)).rows[0].rows;
 const charge=(await x.audit.query('SELECT count(*)::int count,coalesce(sum(logical_bytes),0)::int bytes FROM (SELECT logical_bytes FROM research_input_preparations_v2 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2) q')).rows[0];
 const v={audit,ledger,ledgerHash:hash(canonical(ledger)),author,charge,fd:{...x.witness}};x.save(label+'.json',v);return v;
}
async function lifecycle(x){
 x.setStage('author lifecycle: genuine v3 input firstseal');const prepared=await snapshot(x,'01-prepared');const first=await x.controller.runCompleteInput(x.rpc,x.req,true);assert.equal(first.replay,false);const sealed=await snapshot(x,'02-firstseal-observed');assert.equal(sealed.charge.count,2);const revision=sealed.ledger.revisions[0];assert.equal(first.revision_id,revision.revision_id);
 const names=['assign_research_author_v2','read_research_author_assignment_v2','read_research_author_packet_v2','receive_research_author_result_v2','read_research_author_result_v2'],trace=[];
 const db={rpc:async(name,args)=>{trace.push({name,fd:{...x.witness}});x.save('author-rpc-order.json',trace);if(!names.includes(name))return x.rpc.rpc(name,args);const keys=['p_request','p_revision_id','p_input_hash','p_principal',...(name==='receive_research_author_result_v2'?['p_result']:[])];assert.equal((await x.c.query('SELECT current_user role')).rows[0].role,'service_role');try{return{data:(await x.c.query(`SELECT public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) value`,keys.map(k=>args[k]))).rows[0].value,error:null};}catch(e){x.save('author-rpc-error.json',{name,code:e.code,message:e.message,where:e.where});throw e;}}};
 const config={bindingTexts:x.texts.filter(t=>JSON.parse(t).wireVersion==='research-article-input-v3'),executorFingerprint:x.hc},composition=createV3AuthorArticleComposition(config);let article,observation;
 const request=action=>new Request('https://fixture.invalid/private-native-composition-not-http-route',{method:'POST',headers:{authorization:'Bearer '+process.env.INTERNAL_API_KEY,'content-type':'application/json','x-research-author-result-action':action},body:JSON.stringify({action,input:x.req,inputRevisionId:revision.revision_id,inputHash:revision.input_hash,...(action==='receiveAuthorResult'?{article,observation}:{})})});
 x.setStage('author lifecycle: actual authenticated assign and packet');const assigned=await composition.assignAuthor(request('assignAuthor'),db),packet=await composition.readAuthorPacket(request('readAuthorPacket'),db);const a=await snapshot(x,'03-assigned');assert.equal(a.author.research_author_assignments_v2.length,1);assert.equal(a.author.research_author_results_v2.length,0);assert.deepEqual(a.ledger,sealed.ledger);assert.deepEqual(a.fd,sealed.fd);
 const set=await createV3CashCitationConsumer(config).read(db,JSON.stringify(x.req),revision.revision_id,revision.input_hash),original=nativeArticle(x.symbol,revision,set);article=original.article;
 const validated=await createV3BusinessArticleValidator(config).validate(db,JSON.stringify(x.req),revision.revision_id,revision.input_hash,JSON.stringify(article),packet.packet.sources.map(s=>s.descriptor));
 observation={version:'research_execution_observation_v2',assignmentId:assigned.assignment.assignment_id,jobId:x.req.jobId,attempt:x.req.attempt,reservationId:x.req.reservationId,inputRevisionId:revision.revision_id,inputHash:revision.input_hash,articleHash:validated.validatedArticle.articleHash,reviewPackHash:null,outputHash:completeHash(article),verificationLevel:'trusted_controller_observation',providerSurface:'codex_cross_chat',hostId:null,threadId:randomUUID(),turnId:null,invocationId:'synthetic-local-'+randomUUID(),dispatchObservationHash:hash('synthetic-dispatch'),completionObservationHash:hash('synthetic-completion'),controllerObservedStartAt:article.authoredAt,controllerObservedEndAt:new Date().toISOString(),modelIdentity:null};
 x.setStage('author lifecycle: actual durable receive COMMIT');const received=await composition.receiveAuthorResult(request('receiveAuthorResult'),db),saved=await snapshot(x,'04-result-observed');assert.equal(saved.author.research_author_results_v2.length,1);const row=saved.author.research_author_results_v2[0];assert.equal(row.result_hash,received.result.result_hash);assert.deepEqual(row.payload,received.result.payload);assert.equal(row.result_hash,completeHash(row.payload));assert.equal(row.logical_bytes,Buffer.byteLength(completeCanonical(row.payload)));assert.deepEqual(saved.ledger,sealed.ledger);assert.deepEqual(saved.fd,sealed.fd);
 const duplicate=await composition.receiveAuthorResult(request('receiveAuthorResult'),db);assert.deepEqual(duplicate.result,received.result);const replay=await snapshot(x,'05-exact-receive-replay');assert.deepEqual(replay,saved);
 for(const root of Object.values(x.roots)){assert.equal(path.dirname(root),x.secure);fs.rmSync(root,{recursive:true});}
 x.setStage('author lifecycle: missing roots exact read recovery');const read=await composition.readAuthorResult(request('readAuthorResult'),db);assert.deepEqual(read.result,received.result);const recovered=await snapshot(x,'06-no-roots-read-recovery');assert.deepEqual(recovered,saved);
 x.save('author-result-witness.json',{symbol:x.symbol,opened:sealed.fd.opens-prepared.fd.opens,closed:sealed.fd.closes-prepared.fd.closes,inputCharge:saved.charge,inputRowHash:hash(canonical(revision)),authorRowHash:hash(canonical(row)),articleHash:row.payload.validatedArticle.articleHash,originalDraftSha:original.draftSha,rpcCalls:trace.map(v=>v.name),actualDurableRows:1,formalAuthorApproval:false,syntheticObservation:true,actualHttpRoute:false,sourceProseMapping:original.sourceProseMapping});
}
await test('new author durable union: actual install and two issuer lifecycles',async t=>{
 for(const symbol of ['2409','2383']){let failure;await t.test(symbol+' frozen candidate SQL install then durable author lifecycle',async()=>{
  const label='author-durable-'+symbol;try{await withLegalVersionedFixture(symbol,{label,wireVersion:'research-article-input-v3',afterPrerequisite:installer},async x=>{try{await lifecycle(x);}catch(error){await snapshot(x,'failure-business-before-cleanup');throw error;}});}catch(error){failure=error;throw error;}
  finally{const base=process.env.RESEARCH_PREREQUISITE_PROFILE_ARTIFACTS,p=path.join(base,symbol+'-'+label+'-cleanup.json');if(fs.existsSync(p)){const cleanup=JSON.parse(fs.readFileSync(p));assert.equal(fs.existsSync(cleanup.removed),false);fs.writeFileSync(path.join(base,symbol+'-'+label+'-cluster-absent.json'),JSON.stringify({clusterRemoved:true,stopped:cleanup.stopped,stage:cleanup.stage})+'\n');}}
 });if(failure)throw failure;}
});

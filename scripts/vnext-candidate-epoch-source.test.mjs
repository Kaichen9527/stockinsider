import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('migrations/20261107_vnext_candidate_epoch_journal_v1.sql');
const body=sql.split('AS $append$')[1].split('END $append$;')[0];
const table=sql.split('CREATE TABLE public.vnext_candidate_epoch_events_v1(')[1].split('\n);')[0];
const base=read('migrations/20261022_stockinsider_vnext_20_v1.sql');
const cancellation=JSON.parse(read('scripts/opportunity-v3/vnext-catalyst-cancellation-profile-v1.json'));
const sha=value=>createHash('sha256').update(value).digest('hex');

// Source assertions only. No PostgreSQL, native fixture or installed catalog is
// imported/executed; none of these checks establish runtime ACL/CAS/rollback.
test('candidate remains unregistered source-only and unconditionally disabled even to its owner',()=>{
 for(const value of ['SOURCE CANDIDATE ONLY','NOT_APPLIED','native HOLD'])assert.ok(sql.includes(value));
 const firstStatement=body.slice(body.indexOf('BEGIN')+5).replace(/--[^\n]*/gu,'').trimStart();
 assert.ok(firstStatement.startsWith("RAISE EXCEPTION 'vnext_candidate_epoch_hooks_not_connected';"));
 assert.equal(/CREATE OR REPLACE|ALTER ROLE|ALTER POLICY|CREATE ROLE|GRANT |set_config\(|current_setting\([^)]*(?:enable|approved|epoch)|DISABLE TRIGGER/iu.test(sql),false);
 assert.equal(/CREATE TRIGGER[^;]*ON public\.(?:vnext_members_v1|vnext_jobs_v1|vnext_publications_v1|vnext_audit_v1)/iu.test(sql),false);
 assert.equal(/SECURITY DEFINER/iu.test(sql),false);
 assert.ok(sql.includes('LANGUAGE plpgsql SECURITY INVOKER'));
});
test('new journal has no service role read/write/execute or identity sequence privileges and retains original fence',()=>{
 for(const target of ['public.vnext_candidate_epoch_events_v1','SEQUENCE public.vnext_candidate_epoch_events_v1_ordinal_seq','FUNCTION public.vnext_candidate_epoch_append_internal_v1(jsonb)','FUNCTION public.vnext_candidate_epoch_no_mutation_v1()'])assert.ok(sql.includes('REVOKE ALL ON '+target+' FROM PUBLIC,anon,authenticated,service_role'));
 assert.ok(sql.includes('ALTER TABLE public.vnext_candidate_epoch_events_v1 ENABLE ROW LEVEL SECURITY'));
 assert.ok(sql.includes('BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_candidate_epoch_events_v1 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence()'));
 assert.ok(sql.includes('BEFORE UPDATE OR DELETE ON public.vnext_candidate_epoch_events_v1'));
 assert.ok(sql.includes('BEFORE TRUNCATE ON public.vnext_candidate_epoch_events_v1'));
 assert.ok(sql.includes("RAISE EXCEPTION 'vnext_candidate_epoch_immutable'"));
});
test('same-symbol immutable references, one genesis/successor and explicit nullable admission constraints are source-required',()=>{
 for(const column of ['previous_event_id','epoch_id','previous_epoch_id'])assert.ok(table.includes('FOREIGN KEY('+column+',symbol) REFERENCES public.vnext_candidate_epoch_events_v1(event_id,symbol)'));
 assert.ok(sql.includes('(symbol) WHERE previous_event_id IS NULL'));
 assert.ok(sql.includes('(previous_event_id) WHERE previous_event_id IS NOT NULL'));
 assert.ok(table.includes('UNIQUE(symbol,sequence)'));
 assert.ok(table.includes('CHECK((sequence=1)=(previous_event_id IS NULL))'));
 assert.ok(table.includes('CHECK(coalesce('));
 const admitted=table.split("cause_path='core.enqueue.admitted'")[1].split('\n  OR')[0];
 for(const guard of ['state IS NOT NULL',"state='researching'",'epoch_id IS NOT NULL','epoch_started_at IS NOT NULL','epoch_id=event_id','epoch_started_at=occurred_at','job_id IS NOT NULL'])assert.ok(admitted.includes(guard));
 assert.ok(table.includes('CHECK((epoch_id IS NULL)=(epoch_started_at IS NULL))'));
 assert.ok(table.includes("CHECK(schema_version='vnext-candidate-epoch-event-v1')"));
 assert.ok(table.includes("CHECK(policy_version='stockinsider-vnext-20-v1')"));
 assert.ok(body.includes("jsonb_build_object('schemaVersion','vnext-candidate-epoch-event-v1','policyVersion','stockinsider-vnext-20-v1','request',p_event)"));
});
test('all input is bounded/closed and exactly three prospective cause paths have closed public reason codes',()=>{
 assert.ok(body.includes('octet_length(p_event::text)>4096'));
 assert.ok(body.includes('jsonb_object_keys(p_event))<>13'));
 for(const unsupported of ['epochId','epochStartedAt','sequence','recordedAt','kind','state','coverage','enabled','approved','sourceCauseVerified','rawReason','evidence'])assert.equal(body.slice(body.indexOf('ARRAY['),body.indexOf("THEN RAISE EXCEPTION 'vnext_candidate_epoch_closed_request'")).includes("'"+unsupported+"'"),false);
 assert.ok(table.includes("cause_path IN('core.enqueue.admitted','core.enqueue.deferred','core.exit.target_hit')"));
 assert.ok(table.includes("reason_code IN('admitted','eligibility_evidence_missing','unchanged_input','daily_budget','active_capacity','work_in_progress','target_hit')"));
 assert.ok(body.includes("RAISE EXCEPTION 'vnext_candidate_epoch_unsupported_cause'"));
 assert.ok(table.includes("coverage_gaps=ARRAY['pre_activation_history_unavailable','uncovered_mutation_paths','hooks_not_connected']"));
});
test('prospective full-request replay and cause conflict occur before current-tail CAS/clock/lineage hydration',()=>{
 const markers=["'request',p_event",'SELECT * INTO replay','replay.request_hash<>digest',"'replay',true",'SELECT * INTO prior','prior.event_id IS DISTINCT FROM expected','occurred:=','vnext_candidate_epoch_job_lineage_mismatch','INSERT INTO public.vnext_candidate_epoch_events_v1'];
 const positions=markers.map(marker=>body.indexOf(marker));positions.forEach(position=>assert.ok(position>=0));
 assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
 assert.ok(table.includes('UNIQUE(symbol,cause_path,cause_id)'));
 assert.ok(body.includes("RAISE EXCEPTION 'vnext_candidate_epoch_idempotency_conflict'"));
 assert.ok(body.includes('replay.event_id<>requested OR replay.symbol<>symbol_value OR replay.cause_path<>path_value OR replay.cause_id<>'));
 assert.equal(/digest:=[^;]*(?:recorded|sequence|clock_timestamp)/u.test(body),false);
 assert.equal(/FROM public\.vnext_members_v1|FROM public\.vnext_audit_v1|admitted_session|UPDATE public\.vnext_/u.test(body),false);
});
test('future algorithm pins stable job admission, publication/session/principal references and no mutable membership epoch bootstrap',()=>{
 for(const reference of ['public.vnext_jobs_v1(job_id)','public.vnext_publications_v1(revision_id)','public.vnext_sessions_v1(session_date)','public.vnext_principals_v1(principal)'])assert.ok(table.includes('REFERENCES '+reference));
 assert.equal(/ON DELETE CASCADE|ON UPDATE CASCADE|DELETE FROM|TRUNCATE TABLE/iu.test(sql),false);
 assert.ok(body.includes("THEN work.admission_hash=p_event->>'inputHash' AND work.retry_of IS NULL ELSE work.input_hash=p_event->>'inputHash' END"));
 assert.ok(body.includes("pub.symbol=symbol_value AND pub.input_hash=p_event->>'inputHash' AND pub.published_at<=occurred"));
 assert.ok(body.includes("root.kind<>'admitted' OR root.epoch_id IS DISTINCT FROM root.event_id"));
 assert.ok(body.includes("IF prior.state IN('researching','waiting','eligible') THEN RAISE EXCEPTION 'vnext_candidate_epoch_unrecorded_exit_or_active_update'"));
 assert.ok(body.includes('epoch_value:=prior.epoch_id;epoch_start:=prior.epoch_started_at'));
 assert.ok(body.includes('epoch_value:=requested;epoch_start:=occurred'));
 assert.ok(body.includes('occurred<statement_timestamp() OR occurred>recorded'));
});
function checkProspectiveAnchors(profile,source){
 const routine=profile.routines.find(item=>item.signature==='public.vnext_command_v1(text,text,jsonb)');
 assert.equal(routine?.successorBodySha256,'130fa80b87ece7cc9bfb59b5998078cfd76ebb852a12632706e3fc5cf7eefafb');
 assert.equal(profile.migrationSha256,sha(read(profile.migration)));
 for(const anchor of ["   INSERT INTO public.vnext_members_v1(symbol,state,input_hash,evidence,admitted_session)","    answer:=answer||jsonb_build_array(jsonb_build_object('symbol',v_symbol,'deferred',CASE WHEN count_started>=4", "  UPDATE public.vnext_members_v1 SET state='exited',contraindication=(r->>'reason'='verified_contraindication')"]){
  assert.equal(source.split(anchor).length-1,1);
 }
}
test('future hook design anchors verify original source and retained final source profile only; drift negatives fail closed',()=>{
 checkProspectiveAnchors(cancellation,base);
 const changed=structuredClone(cancellation);changed.routines.find(item=>item.signature==='public.vnext_command_v1(text,text,jsonb)').successorBodySha256='0'.repeat(64);
 assert.throws(()=>checkProspectiveAnchors(changed,base));
 assert.throws(()=>checkProspectiveAnchors(cancellation,base.replace('   INSERT INTO public.vnext_members_v1(symbol,state,input_hash,evidence,admitted_session)','   INSERT INTO other_table')));
 assert.throws(()=>checkProspectiveAnchors(cancellation,base+'\n   INSERT INTO public.vnext_members_v1(symbol,state,input_hash,evidence,admitted_session)'));
});

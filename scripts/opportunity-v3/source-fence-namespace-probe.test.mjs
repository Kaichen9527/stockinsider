import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const rootFile=(relative)=>new URL('../../'+relative,import.meta.url);
const original=rootFile('migrations/20261009_research_publication_source_fence_v2.sql');
const stateFile=rootFile('migrations/20261010_research_atomic_publication_v2.sql');
const candidate=new URL('./fixtures/source-fence-namespace/prebound-private-schema.sql',import.meta.url);
const owner='research_source_fence_owner_v2';
const sourceId='00000000-0000-4000-8000-000000000011';
const newerId='00000000-0000-4000-8000-000000000012';
const sqlQuote=value=>"'"+value.replaceAll("'","''")+"'";

const setup = [
  'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE research_observed_rpc_owner;',
  'CREATE ROLE research_source_fence_owner_v2 NOLOGIN NOSUPERUSER NOBYPASSRLS;',
  'REVOKE ALL ON SCHEMA public FROM PUBLIC;',
  'GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role,research_observed_rpc_owner;',
  'CREATE TABLE public.source_raw_documents(id uuid PRIMARY KEY, document_url text, published_at timestamptz, collected_at timestamptz, metadata jsonb NOT NULL, body text);',
  'ALTER TABLE public.source_raw_documents ENABLE ROW LEVEL SECURITY;',
  'GRANT SELECT,INSERT,UPDATE,DELETE ON public.source_raw_documents TO service_role;',
  'CREATE POLICY trusted_writer ON public.source_raw_documents TO service_role USING(true) WITH CHECK(true);',
  'CREATE POLICY source_fence_read ON public.source_raw_documents FOR SELECT TO research_source_fence_owner_v2 USING(true);',
].join('\n');

const insert=(id, url, collected, body, metadata={rights_boundary:'public_citation'})=>
  'INSERT INTO public.source_raw_documents VALUES('+
  [id,url,'2026-11-16T03:00:00Z',collected,JSON.stringify(metadata),body].map(sqlQuote).join(',')+')';
const url='https://example.invalid/original';
const cutoff='2026-11-16T09:00:00Z';
const clock="SET TIME ZONE 'UTC'; ";
const asService='SET ROLE service_role; ';
const catalog = [
  "SELECT jsonb_build_object('publicSchema',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.nspname='public'),",
  "'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r WHERE rolname IN('research_source_fence_owner_v2','service_role','anon','authenticated')),",
  "'tableAccess',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace='public'::regnamespace),",
  "'policy',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace),",
  "'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace),",
  "'publicRoutines',(SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace));",
].join('\n');

test('prebound v2 source writes still require namespace access for foreign-key invalidation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'si-source-fence-'));
  const data=path.join(root,'data'),port=String(54000+process.pid%1000);
  const pg=(name,argv,input)=>spawnSync(process.env.OPPORTUNITY_V3_POSTGRES_BIN
    ?path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN,name):name,argv,
    {input,encoding:'utf8',timeout:30000,env:{...process.env,LC_ALL:'C',TZ:'UTC'}});
  const check=result=>{
    assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);
    return result.stdout.trim();
  };
  const database='stockinsider_source_fence_probe';
  const psql=(input,dbname=database)=>pg('psql',
    ['-X','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',root,'-p',port,'-U','lab','-d',dbname,'-At'],input);
  const sql=input=>check(psql(clock+input));
  const deny=(input,diagnostic)=>{
    const response=psql(clock+input);
    assert.notEqual(response.status,0);
    assert.match(response.stderr,diagnostic);
  };

  let started=false;
  try{
    check(pg('initdb',['-D',data,'-U','lab','-A','trust','--no-locale','--encoding=UTF8']));
    check(pg('pg_ctl',['-D',data,'-l',path.join(root,'server.log'),'-w','-o','-c listen_addresses= -k '+root+' -p '+port,'start']));
    started=true;
    check(psql('CREATE DATABASE '+database+';', 'postgres'));
    sql(setup);
    sql(fs.readFileSync(original,'utf8'));
    const stateSql=fs.readFileSync(stateFile,'utf8');
    const first=stateSql.indexOf('CREATE FUNCTION public.research_publication_source_state_v2(');
    const last=stateSql.indexOf('CREATE FUNCTION public.read_completed_research_publication_v2(',first);
    assert.ok(first>=0&&last>first);
    sql(stateSql.slice(first,last));
    const statement=insert(sourceId,url,'2026-11-16T04:00:00Z','first source');
    deny(asService+statement+';',/permission denied for schema public/u);
    assert.equal(sql('SELECT count(*) FROM public.source_raw_documents;'),'0');

    const publicBefore=sql(catalog);
    const candidateText=fs.readFileSync(candidate,'utf8');
    deny(candidateText,/source_fence_probe_database_required/u);
    sql("SET stockinsider.source_fence_probe='enabled'; "+candidateText);
    assert.equal(sql(catalog),publicBefore,'public table/routine ACLs, policies, roles and triggers retained exactly');
    assert.equal(sql("SELECT has_schema_privilege('"+owner+"','public','USAGE'),"
      +"has_schema_privilege('"+owner+"','stockinsider_source_fence','USAGE'),"
      +"has_schema_privilege('"+owner+"','stockinsider_source_fence','CREATE');"),'f|t|f');
    for(const role of ['anon','authenticated','service_role','research_observed_rpc_owner']){
      const prefix='SET ROLE '+role+'; ';
      assert.equal(sql("SELECT has_schema_privilege('"+role+"','stockinsider_source_fence','USAGE'),"
        +"has_function_privilege('"+role+"','stockinsider_source_fence.document_row(uuid)','EXECUTE');"),'f|f');
      deny(prefix+'SELECT stockinsider_source_fence.document_row('+sqlQuote(sourceId)+');',/permission denied for schema stockinsider_source_fence/u);
    }
    assert.equal(sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace"
      +" WHERE n.nspname='stockinsider_source_fence' AND (p.prosecdef OR p.prosqlbody IS NULL);"),'0');
    assert.equal(sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace"
      +" WHERE n.nspname='stockinsider_source_fence' AND 'security_invoker=true'=ANY(c.reloptions);"),'3');

    sql(asService+statement+';');
    sql(asService+statement+' ON CONFLICT DO NOTHING;');
    sql(asService+"UPDATE public.source_raw_documents SET body=body WHERE id='"+sourceId+"';");
    assert.equal(sql('SELECT count(*) FROM public.research_source_fence_events_v2;'),'1');
    const rowHash=sql("SELECT encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex')"
      +" FROM public.source_raw_documents s WHERE id='"+sourceId+"';");
    const receiptInput=JSON.stringify([{id:sourceId,rowHash}]);
    const makeSeal=doc=>asService+'SELECT public.seal_research_sources_v2('+sqlQuote(doc)+','+sqlQuote(cutoff)+');';
    const sealed=JSON.parse(sql(makeSeal(receiptInput)));
    assert.equal(sealed.publicationAuthorized,false);
    assert.equal(sealed.historicalPITEligible,false);
    assert.deepEqual(Object.keys(sealed).sort(),['cutoff','documents','historicalPITEligible','publicationAuthorized','received_at','request_hash','seal_id']);
    assert.deepEqual(sealed.documents,[{id:sourceId,rowHash,root:url,rights:'public_citation',
      publishedAt:'2026-11-16T03:00:00+00:00',observedAt:'2026-11-16T04:00:00+00:00'}]);
    assert.deepEqual(JSON.parse(sql(makeSeal(receiptInput))),sealed);
    const verifySeal='SELECT public.assert_research_source_seal_v2('+sqlQuote(sealed.seal_id)+');';
    assert.deepEqual(JSON.parse(sql(verifySeal)).documents,sealed.documents);
    deny(asService+verifySeal,/permission denied for function assert_research_source_seal_v2/u);
    const checkState="SET ROLE research_observed_rpc_owner; SELECT public.research_publication_source_state_v2("+sqlQuote(sealed.seal_id)+");";
    assert.equal(sql(checkState),'published');
    deny(asService+"TRUNCATE public.source_raw_documents;",/permission denied for table/u);
    deny("TRUNCATE public.source_raw_documents;",/research_source_truncate_fenced/u);
    deny('BEGIN ISOLATION LEVEL REPEATABLE READ; '+asService+insert(newerId,url,'2026-11-16T05:00:00Z','bad isolation')+';',/source_fence_read_committed_required/u);
    const counts='SELECT (SELECT count(*) FROM public.source_raw_documents),'
      +'(SELECT count(*) FROM public.research_source_fence_events_v2),'
      +'(SELECT count(*) FROM public.research_source_seal_invalidations_v2);';
    const preFailure=sql(counts);
    assert.equal(preFailure,'1|1|0');
    const failed=psql(clock+asService+insert(newerId,url+'#si-revision-correction','2026-11-16T05:00:00Z','revision')+';');
    assert.notEqual(failed.status,0);
    assert.match(failed.stderr,/42501: permission denied for schema public/u);
    assert.match(failed.stderr,/SELECT 1 FROM ONLY "public"\."research_source_seals_v2"/u);
    assert.match(failed.stderr,/INSERT INTO stockinsider_source_fence\.invalidations/u);
    assert.equal(sql(counts),preFailure,'foreign-key rejection rolls back the source, event and invalidation');
    assert.equal(sql(checkState),'published');
    assert.deepEqual(JSON.parse(sql(verifySeal)).documents,sealed.documents);
    sql(asService+insert(newerId,url+'/separate','2026-11-16T05:00:00Z','independent root')+';');
    sql(asService+"DELETE FROM public.source_raw_documents WHERE id='"+newerId+"';");
    assert.equal(sql(checkState),'published');
    assert.equal(sql("SELECT string_agg(operation,',' ORDER BY event_id) FROM public.research_source_fence_events_v2;"),'INSERT,INSERT,DELETE');
    deny("DELETE FROM public.research_source_fence_events_v2;",/immutable_source_receipt/u);

    // The private helper must hash the entire source row, not a fixed list of
    // columns that silently ignores later schema additions.
    sql("ALTER TABLE public.source_raw_documents ADD COLUMN review_sample text DEFAULT 'full-row-column';");
    assert.equal(sql("SET ROLE "+owner+"; SELECT stockinsider_source_fence.document_row('"+sourceId+"')->>'review_sample';"),'full-row-column');
    assert.notEqual(sql("SELECT encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') FROM public.source_raw_documents s;"),rowHash);
    deny(makeSeal(receiptInput),/source_seal_hash_changed/u);
    deny(verifySeal,/source_seal_hash_changed/u);
  }finally{
    if(started)check(pg('pg_ctl',['-D',data,'-w','-m','immediate','stop']));
    fs.rmSync(root,{recursive:true,force:true});
  }
});

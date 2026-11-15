/** Source contracts only. No SQL/native/server/provider execution or acceptance. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const sql=read('migrations/20261115_vnext_financial_preparation_v1.sql');
const handler=read('web/src/lib/vnext/financial-preparation.ts');
const contract=read('web/src/lib/vnext/financial-preparation-contract.ts');
test('new private preparation keeps oldwriter/roles/qualification policy untouched; additiveRLS andimmutableprivate ledgers',()=>{
 for(const table of ['attempts','commits','outcomes','knowledge','validations'])assert.ok(sql.includes(`CREATE TABLE public.financial_preparation_${table}_v1`));
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/u);assert.match(sql,/BEFORE UPDATE OR DELETE/u);assert.match(sql,/REVOKE ALL ON public\.%I FROM PUBLIC,anon,authenticated,service_role/u);
 assert.doesNotMatch(sql,/CREATE ROLE|ALTER ROLE|ALTER TABLE public\.(?:vnext_members|candidate_financial)|UPDATE public\.vnext_members|qualified\s*=\s*true/iu);
});
test('backend guard cannot borrowANYlease orfence-offNULL; exactownedlease rowlocked andactiveVPSrelease required',()=>{
 assert.match(sql,/backend IS NULL THEN RAISE EXCEPTION/u);assert.match(sql,/owner_id=lease_owner AND expires_at>clock_timestamp\(\) FOR SHARE/u);
 assert.match(sql,/writer_kind='vps' AND release_id=release/u);assert.match(sql,/has_function_privilege\(owner_id,oid,'EXECUTE'\)/u);assert.match(sql,/opportunity_v3_rpc_owner/u);
 assert.match(sql,/encode\(sha256\(convert_to\(prosrc,'UTF8'\)\),'hex'\)=expected_hash/u);
});
test('DBderivesON/OFF pool/admission/source identity; no callerURLorbooleanpermission inlimitonlyclaims',()=>{
 assert.match(sql,/vnext_financial_preparation_scope_v1/u);assert.match(sql,/mode_row\.enabled/u);assert.match(sql,/state<>'exited'\)>20/u);
 assert.match(sql,/vnext_input_sources_current_v1\(member\.evidence,member\.symbol\)/u);assert.match(sql,/financial_preparation_exact_v1\(p_request,ARRAY\['limit'\]\)/u);
 assert.doesNotMatch(handler,/runAdmittedResearch|analysisWriter|enqueueCachedScope|executeResearch|publishRanking/u);
 const head=sql.indexOf('SELECT instrument_authority_id'),interval=sql.indexOf('instrument.valid_from>clock_timestamp()',head);assert.ok(head>0&&interval>head);
 assert.ok(!sql.slice(head,interval).includes('AND i.valid_from<=clock_timestamp()'));assert.match(sql,/instrument\.provider::text IS DISTINCT FROM lower\(instrument\.exchange::text\)/u);
});
test('existing exactprivatefinancialresources areseparatefromGovpublicrights; noFinMindIRortransportexpansion',()=>{
 assert.match(sql,/FileDownLoad\?step=9&functionName=t164sb01&report_id=C&co_id=/u);assert.match(sql,/t187ap06_L_ci/u);assert.match(sql,/mopsfin_t187ap07_O_bd/u);
 assert.ok(!handler.includes('fetchFinMind'));assert.ok(!handler.includes('candidateIssuerIrFallback'));assert.ok(!contract.includes('Gov1.0'));
 const source=read('web/src/lib/candidate-official-financials.ts');const prepared=source.slice(source.indexOf('export async function fetchPreparedOfficialFinancialPayload'));
 assert.match(prepared,/readBoundedTpexBody\(response,12000000\)/u);assert.ok(!prepared.includes('fetchTpexOfficialPayloadByRange'));assert.ok(!prepared.includes('boundedOfficialCurlFetch'));
});
test('realoldqueueclaim andparser/factvalidators aredelegatedwithuniqueattemptowner andexactraw/source/period/identitybindings',()=>{
 for(const name of ['claim_candidate_financial_acquisition_jobs_v4','complete_candidate_financial_acquisition_job_v4','complete_candidate_financial_document_receipt_parser_v8','complete_candidate_financial_document_receipt_parser_v10','record_official_financial_validation','finalize_candidate_financial_document_validation_v8','reconcile_candidate_financial_document_job_v9'])assert.ok(sql.includes(name));
 assert.match(sql,/parser_owner=attempt::text/u);assert.match(sql,/lease_owner IS DISTINCT FROM a\.attempt_id::text/u);assert.match(sql,/financial_preparation_fact_source_period_binding/u);assert.match(sql,/exact_validation_subject_required/u);assert.match(sql,/financial_preparation_validations_v1 link/u);assert.match(sql,/validation-ack/u);assert.ok(!sql.includes('newer.source_sha256=v.source_sha256'));assert.match(sql,/REFERENCES public\.official_financial_validation_receipts\(id\)/u);
 assert.match(sql,/interval '90 seconds'/u);assert.ok(!sql.includes("interval '300 seconds'"));
 const start=sql.indexOf("IF p_request->>'reason'='requested_period_missing' THEN"),end=sql.indexOf("ELSIF a.operation='acquire'",start);assert.ok(start>0&&end>start);
 const deferral=sql.slice(start,end);assert.match(deferral,/interval '6 hours'/u);assert.match(deferral,/WHERE job_id=a\.job_id AND status='running' AND lease_owner=a\.attempt_id::text/u);assert.doesNotMatch(deferral,/attempts\s*=|consecutive_failures\s*=|fail_candidate_financial/u);

});
test('separateknowledge witness observescommittedXIDbeforeDBclock andcannotacceptcalleravailability',()=>{
 assert.match(sql,/outcome\.created_xid=txid_current\(\)/u);assert.match(sql,/outcome_xid<>witness_xid/u);
 assert.match(sql,/SELECT \* INTO outcome FROM public\.financial_preparation_outcomes_v1 WHERE attempt_id=a\.attempt_id FOR SHARE;at:=clock_timestamp\(\)/u);
 assert.match(sql,/greatest\(at,outcome\.recorded_at,commit_row\.observed_at,commit_row\.recorded_at\)/u);assert.match(handler,/rpc\(scope,'witness',\{attemptId:/u);
});
test('serverselectedboundedrecovery resumesactualcommits withoutprovider/stagingreplay; no callerattempt IDs acceptedbyHTTP',()=>{
 assert.match(sql,/recover-acquire','recover-parse/u);assert.match(sql,/LIMIT 41 LOOP/u);assert.match(sql,/scanned>40/u);assert.match(sql,/operation=requested_operation AND k\.attempt_id IS NULL AND/u);assert.match(sql,/Ordinary successful history is a separate bounded read/u);
 assert.match(handler,/rpc\(actor,`recover-\$\{operation\}`/u);const start=handler.indexOf('for(const entry of recovery.pending)'),end=handler.indexOf('while(claimed+recovered',start);
 assert.ok(start>0&&end>start);assert.ok(!handler.slice(start,end).includes('stage('));assert.ok(!handler.slice(start,end).includes('commit-acquire'));
 assert.match(handler,/preparationExact\(value,'limit'\)/u);assert.match(handler,/operator_reconciliation_required/u);
});
test('actualtwo routes callonlydedicatedpreparation entry beforeanygenericdispatch; guardedcore oldresearchboundaries remain',()=>{
 for(const file of ['web/src/app/api/internal/candidate-financial-queue-drain/route.ts','web/src/app/api/internal/candidate-financial-documents/worker/route.ts']){
  const route=read(file);assert.match(route,/Reflect\.apply\(handleFinancialDataPreparation/u);assert.ok(!route.includes('vnextRoute'));assert.ok(!route.includes('getSupabase'));
 }
 const financial=read('web/src/lib/candidate-official-financials.ts'),parser=read('web/src/lib/candidate-financial-local-parser.ts');
 assert.match(financial,/fetchCandidateMopsFiling\([\s\S]*?await verifyAdmittedResearch\(candidate.symbol\);\s*return fetchCandidateMopsFilingCore/u);
 assert.match(parser,/runCandidateFinancialLocalParser\([\s\S]*?await verifyAdmittedResearch\(input.expectedEntity\);\s*return runCandidateFinancialLocalParserCore/u);
 assert.match(parser,/financial_preparation_parser_options_forbidden/u);assert.match(handler,/const scopes=new WeakMap/u);assert.ok(!handler.includes('export function register'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {FINANCIAL_PROVIDER_PROTOCOL,projectFinancialEvidenceSources} from './financial-evidence-sources.ts';

const symbol='5274', period='2026-09-30';
const reportingDate='2026-11-11T08:50:18.000000Z';
const collected='2026-11-16T00:00:00.000001Z';
const validated='2026-11-16T00:00:00.000005Z';
const cutoff='2026-11-16T00:00:00.000008Z';
const source='https://mopsov.twse.com.tw/server-java/FileDownLoad?step=9&functionName=t164sb01&report_id=C&co_id=5274&year=2026&season=3';
const raw='a'.repeat(64), manifest='b'.repeat(64);
const stock='00000000-0000-4000-8000-000000000003', id='00000000-0000-4000-8000-000000000004';
const document='00000000-0000-4000-8000-000000000005', receipt='00000000-0000-4000-8000-000000000006';
const parser='00000000-0000-4000-8000-000000000007', provenance='00000000-0000-4000-8000-000000000008';
function fixture(){
 const fact={fact_id:id,stock_id:stock,fact_key:'quarterly_diluted_eps',period_start:'2026-07-01',period_end:period,duration_kind:'quarterly',value:48.09,unit:'TWD/share',
  provider:'mops',authority_tier:'official_filing',estimate_kind:'reported',estimate_horizon:'reported_period',filing_published_at:reportingDate,
  source_timestamp:collected,collected_at:collected,filing_restatement_id:null,source_ref:`issuer-document:${raw}:${'c'.repeat(64)}`,
  recorded_at:collected,validation_status:'validated',schema_valid:true,unit_valid:true,point_in_time_valid:true,consistency_valid:true,upstream_provider:null,validation_recorded_at:validated};
 const rows={
  provenance:[{provenance_id:provenance,fact_id:id,issuer_document_id:document,source_url:source,source_sha256:raw,
   locator:{parser_evidence_id:parser,manifest_sha256:manifest,response_url:source},extracted_at:collected,recorded_at:collected}],
  jobs:[],links:[{receipt_id:receipt,fact_id:id,fact_recorded_at:collected,evidence_id:parser,created_at:collected}],
  receipts:[{receipt_id:receipt,stock_id:stock,issuer_document_id:document,source_url:source,period_end:period,document_sha256:raw,
   receipt_status:'partial',parser_status:'complete',published_at:reportingDate,accepted_at:collected,completed_at:collected,
   parser_evidence_id:parser,financial_validation_status:'validated'}],
  documents:[{document_id:document,stock_id:stock,document_url:source,document_sha256:raw,acquisition_status:'fetched',collected_at:collected,recorded_at:collected}],
  parserEvidence:[{evidence_id:parser,receipt_id:receipt,document_sha256:raw,manifest_sha256:manifest,recorded_at:collected,evidence_schema_version:10}],
 };
 return {fact,rows};
}

test('versioned MOPS partial filing binds individually validated facts and preserves document and basis gaps',()=>{
 const {fact,rows}=fixture();
 const result=projectFinancialEvidenceSources([fact],rows,cutoff,FINANCIAL_PROVIDER_PROTOCOL,symbol);
 assert.equal(result.evidence[0].availableAt,validated);
 assert.equal(result.evidence[0].financial?.periodStart,'2026-07-01');
 assert.equal(result.evidence[0].financial?.denominatorShares,null);
 assert.equal(result.providerInput?.facts[0].factId,id);
 assert.equal(result.providerInput?.facts[0].receiptHash,result.receipts[0].receiptHash);
 assert.ok(result.gaps.includes('financial_partial_mops_filing'));
 assert.ok(result.gaps.includes('missing_sql_financial_interval_basis_parity'));
 assert.equal(rows.receipts[0].receipt_status,'partial');
});

test('partial MOPS proof requires enabled capability, subject, v10 accounting and original parser binding',()=>{
 const {fact,rows}=fixture();
 assert.equal(projectFinancialEvidenceSources([fact],rows,cutoff).evidence.length,0);
 assert.equal(projectFinancialEvidenceSources([fact],rows,cutoff,FINANCIAL_PROVIDER_PROTOCOL).evidence.length,0);
 assert.equal(projectFinancialEvidenceSources([fact],rows,cutoff,FINANCIAL_PROVIDER_PROTOCOL,'2317').evidence.length,0);
 assert.equal(projectFinancialEvidenceSources([fact],rows,collected,FINANCIAL_PROVIDER_PROTOCOL,symbol).evidence.length,0);
 for(const [field,value] of [['validation_status','rejected'],['validation_recorded_at',null],['provider','tpex']]){
  assert.equal(projectFinancialEvidenceSources([{...fact,[String(field)]:value}],rows,cutoff,FINANCIAL_PROVIDER_PROTOCOL,symbol).evidence.length,0);
 }
 for(const [field,value] of [['receipt_status','rejected'],['financial_validation_status','pending'],['parser_evidence_id',document]]){
  const changed={...rows,receipts:[{...rows.receipts[0],[String(field)]:value}]};
  assert.equal(projectFinancialEvidenceSources([fact],changed,cutoff,FINANCIAL_PROVIDER_PROTOCOL,symbol).evidence.length,0);
 }
 for(const [field,value] of [['evidence_schema_version',8],['manifest_sha256',raw],['recorded_at','2026-11-16T00:00:00.000009Z']]){
  const changed={...rows,parserEvidence:[{...rows.parserEvidence[0],[String(field)]:value}]};
  assert.equal(projectFinancialEvidenceSources([fact],changed,cutoff,FINANCIAL_PROVIDER_PROTOCOL,symbol).evidence.length,0);
 }
});

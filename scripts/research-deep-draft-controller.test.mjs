import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {deepControllerCommand} from './research-deep-controller.mjs';
import {researchCanonicalHash as hash} from '../web/src/lib/research-agent-qualification.ts';
import {candidateDossierBundleId} from '../web/src/lib/candidate-dossier-contract.ts';
import {DEEP_ARTICLE_SECTION_ORDER} from '../web/src/lib/research-deep-article.ts';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const source='b'.repeat(40),owner=`draft-author:${id}`,start='2026-10-08T01:01:00Z',later='2026-10-08T01:20:00Z';
const context=()=>({schemaVersion:'research-deep-claim-context-v1',observedAt:start,
  job:{jobId:id,symbol:'2409',priorityRunId:id,attempt:1,owner,leaseExpiresAt:'2026-10-08T01:30:00.010Z'},
  modelReservation:{reservationId:id,role:'company_research',owner,workKey:`deep:${id}:1`,startedAt:'2026-10-08T01:00:00Z',leaseExpiresAt:'2026-10-08T01:30:00Z'},modelCompletion:null});
function packet() {
  const summary='合成驗收來源摘要：本案例只測試契約與保存，不表示真實公司已有訂單。';
  const material={schemaVersion:'research-deep-author-input-v1',dataCutoff:start,job:context().job,modelReservation:context().modelReservation,
    discovery:{runId:id,asOf:'2026-10-07T00:00:00Z',inputHash:'a'.repeat(64)},
    financial:{bundleId:candidateDossierBundleId('a'.repeat(64)),revisionId:id,inputHash:'a'.repeat(64),asOf:'2026-10-07T00:00:00Z',availableAt:'2026-10-07T03:00:00Z',
      facts:[{factId:'synthetic-revenue',key:'revenue',periodEnd:'2026-09-30',value:1000,unit:'million',sourceUrl:'https://example.org/financial',asOf:'2026-10-07T00:00:00Z',availableAt:'2026-10-07T03:00:00Z'}]},
    sources:[{documentId:doc,rootId:'https://example.org/source',platform:'official',symbols:['2409'],subjectScope:'company_mentions',companyEvidence:true,
      claimStatus:'confirmed',visibility:'public',acquisitionMethod:'public_document',contentForm:'research_summary',summary,summaryHash:hash(summary),contentHash:'c'.repeat(64),
      publishedAt:'2026-10-07T00:00:00Z',firstObservedAt:'2026-10-07T01:00:00Z',revisionObservedAt:'2026-10-07T01:00:00Z',collectedAt:'2026-10-07T02:00:00Z',availableAt:'2026-10-07T02:00:00Z',rightsBoundary:'public_citation',publishable:true}],
    gaps:[],sourceSelectionComplete:false,financialForecastComplete:false,modelDispatched:false,authoritativePublication:false,requiresIndependentReview:true};
  return {...material,inputHash:hash(material)};
}
function article() {
  const bridge={segmentBasis:'consolidated_only',segmentNote:'合成會計驗收，非真實財測或公司研究。',segments:[{business:'synthetic consolidated',revenueMillions:1000,grossMargin:0.3,operatingExpenseMillions:0}],
    otherOperatingIncomeMillions:0,corporateOperatingIncomeMillions:0,nonOperatingMillions:0,taxRate:0.2,nonControllingIncomeMillions:0,oneOffAfterTaxMillions:0,dilutedSharesMillions:400};
  return {schemaVersion:'candidate-deep-research-v1',symbol:'2409',authoredAt:'2026-10-08T01:19:00Z',evidenceCutoffAt:start,
    summary:'這是合成保存驗收，所有會計數字僅用於測試既有契約與引用，沒有真實公司研究或訂單結論，也沒有獨立審查、策略批准或正式發表。',
    sections:DEEP_ARTICLE_SECTION_ORDER.map(key=>({key,title:key,paragraphs:[{kind:'inference',text:'這是合成驗收論點，不能據此推論公司的實際訂單、量產或投資策略已被核准。',sourceDocumentIds:[doc],officialFactIds:['synthetic-revenue']}]})),
    catalysts:[{name:'synthetic research',evidenceDocumentIds:[doc],stage:'customer_validation',earliestFinancialPeriod:'2028-Q1',affectedBusiness:'synthetic business',
      financialTransmission:'這是合成傳導案例，只有驗證會計與資料保存的用途。',strongestCounterEvidence:'合成案例缺少真實訂單与公司營運證據。',falsifier:'後續實際公司資料可能完全否定本合成案例。'}],
    scenarios:['existing_business','conditional_commercialization','delay_or_failure'].map(name=>({name,fiscalYear:2028,baselineEps:0.6,baselineBridge:structuredClone(bridge),incrementalRevenueMillions:0,
      grossMargin:0.3,incrementalOperatingExpenseMillions:0,nonOperatingMillions:0,taxRate:0.2,ownershipFraction:1,dilutedSharesMillions:400,peMultiple:name==='conditional_commercialization' ? null : 20,
      yearsToValue:2,discountRate:0.1,evidenceDocumentIds:[doc],officialFactIds:['synthetic-revenue'],assumptionNotes:'合成財測參數只做會計契約測試，從未確認實際公司研究或投資效果。'}))};
}
async function fixture(fn,changePacket=()=>{}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'si-private-draft-'));await fs.chmod(dir,0o700);
  const file=n=>path.join(dir,n);let clock=start;let posts=0;
  const deps={env:{INTERNAL_API_KEY:'synthetic-draft-fixture-key'},source:()=>({commit:source,dirty:false}),now:()=>clock,claimId:()=>id,
    post:async(_url,body)=>{posts++;if(body.action==='input'){const p=packet();changePacket(p);const {inputHash,...material}=p;void inputHash;return {rejected:false,body:{ok:true,packet:{...material,inputHash:hash(material)}}};}
      return {rejected:false,body:{ok:true,context:context(),gap:null}};}};
  try {
    await deepControllerCommand(['claim','--origin','https://example.org','--owner','draft-author','--output',file('claim.json'),'--journal',file('claim.jsonl')],deps);
    const prepared=await deepControllerCommand(['prepare','--origin','https://example.org','--owner','draft-author','--output',file('prepared.json'),'--journal',file('prepare.jsonl'),
      '--request-journal',file('claim.jsonl'),'--bundle-id',packet().financial.bundleId,'--source-ids',doc],deps);
    const model={schemaVersion:'research-deep-model-draft-v1',preparedReceiptHash:prepared.receiptHash,inputHash:prepared.packet.inputHash,job:prepared.packet.job,modelReservation:prepared.packet.modelReservation,article:article()};
    const write=async()=>{await fs.writeFile(file('model.json'),JSON.stringify(model)+'\n',{mode:0o600});};await write();clock=later;
    const args=['draft','--origin','https://example.org','--owner','draft-author','--request-journal',file('claim.jsonl'),'--prepared-input',file('prepared.json'),
      '--prepared-hash',prepared.receiptHash,'--model-output',file('model.json'),'--output',file('artifact')];
    const local={source:deps.source,now:deps.now,post:()=>{throw new Error('must never send');}};
    await fn({dir,file,prepared,model,write,args,local,setClock:c=>{clock=c;},posts:()=>posts});
  } finally {await fs.rm(dir,{recursive:true,force:true});}
}
test('DF01 actual prepared receipt saves at19minutes with immutable clocks, private commit and typed handoff',async()=>fixture(async f=>{
  const before=await fs.readFile(f.file('prepared.json'));const count=f.posts();const result=await deepControllerCommand(f.args,f.local);
  assert.equal(result.draftPersisted,true);assert.equal(result.handoffState,'requires_live_status');assert.equal(result.submissionEligible,false);assert.equal(f.posts(),count);
  const draft=JSON.parse(await fs.readFile(f.file('artifact/draft.json')));assert.equal(draft.articleContractStatus,'contract_valid_pending_review');
  assert.equal(draft.preparedAt,start);assert.equal(draft.dataCutoff,start);assert.equal(draft.modelReservation.leaseExpiresAt,context().modelReservation.leaseExpiresAt);
  assert.equal(draft.article.scenarios[0].totalEps,0.6);assert.deepEqual(draft.handoff.proposedRequest,{action:'handoffModel',owner,jobId:id,attempt:1,articleHash:draft.article.articleHash});
  assert.equal((await fs.stat(f.file('artifact'))).mode&0o777,0o700);
  for(const name of ['commit.json','draft.json','handoff.json','prepared-input.json','model-output.json','original-claim.jsonl']) assert.equal((await fs.stat(f.file('artifact/'+name))).mode&0o777,0o600);
  assert.deepEqual(await fs.readFile(f.file('artifact/prepared-input.json')),before);assert.deepEqual(await fs.readFile(f.file('prepared.json')),before);
}));
test('DF02 restart/duplicate keeps identical receipt; fresh expired inspect never proposes submission',async()=>fixture(async f=>{
  const first=await deepControllerCommand(f.args,f.local);const bytes=await fs.readFile(f.file('artifact/commit.json'));
  const duplicate=await deepControllerCommand(f.args,f.local);assert.equal(duplicate.receiptHash,first.receiptHash);assert.equal(duplicate.replayed,true);
  const script=`import {deepControllerCommand} from ${JSON.stringify(new URL('./research-deep-controller.mjs',import.meta.url).href)}; const r=await deepControllerCommand(${JSON.stringify(['inspectDraft','--output',f.file('artifact'),'--receipt-hash',first.receiptHash])},{source:()=>({commit:'${source}',dirty:false}),now:()=> '2026-10-08T01:31:00Z'}); console.log(JSON.stringify(r));`;
  const restarted=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'}}));
  assert.equal(restarted.leaseState,'expired');assert.equal(restarted.proposedRequest,null);assert.equal(restarted.submissionEligible,false);
  assert.deepEqual(await fs.readFile(f.file('artifact/commit.json')),bytes);
}));
test('DF03 wrong input/job/owner/attempt/reservation and moving cutoff never create artifact',async()=>{
  for(const change of [m=>m.preparedReceiptHash='f'.repeat(64),m=>m.inputHash='f'.repeat(64),m=>m.job={...m.job,attempt:2},m=>m.job={...m.job,owner:'foreign'},
    m=>m.modelReservation={...m.modelReservation,reservationId:doc},m=>m.article.evidenceCutoffAt=later,m=>m.modelReservation={...m.modelReservation,leaseExpiresAt:'2026-10-08T02:00:00Z'}])
    await fixture(async f=>{change(f.model);await f.write();await assert.rejects(deepControllerCommand(f.args,f.local),/deep_draft/);await assert.rejects(fs.stat(f.file('artifact')),/ENOENT/);});
});
test('DF04 producer rewrites of trusted preparation or original journal fail even with recomputed hashes',async()=>{
  for(const target of ['prepared','journal']) await fixture(async f=>{
    if(target==='prepared'){const p=structuredClone(f.prepared);p.packet.financial.facts[0].value=999;const {inputHash,...packet}=p.packet;void inputHash;p.packet={...packet,inputHash:hash(packet)};
      const {receiptHash,...material}=p;void receiptHash;await fs.writeFile(f.file('prepared.json'),JSON.stringify({...material,receiptHash:hash(material)})+'\n');}
    else {const text=(await fs.readFile(f.file('claim.jsonl'),'utf8')).replaceAll(owner,'other-owner');await fs.writeFile(f.file('claim.jsonl'),text);}
    await assert.rejects(deepControllerCommand(f.args,f.local),/deep_draft/);
  });
});
test('DF05 invented source/fact citations and unknown authority or secret fields reject',async()=>{
  for(const change of [m=>m.article.sections[0].paragraphs[0].sourceDocumentIds=[id],m=>m.article.scenarios[0].officialFactIds=['invented'],
    m=>m.strategyApproved=true,m=>m.article.sections[0].paragraphs[0].approved=true,m=>m.article.summary+=' Bearer secret-token'])
    await fixture(async f=>{change(f.model);await f.write();await assert.rejects(deepControllerCommand(f.args,f.local),/deep_draft/);});
});
test('DF06 missing forecasts persist explicitly incomplete without an author handoff proposal',async()=>fixture(async f=>{
  f.model.article.scenarios=[];await f.write();const r=await deepControllerCommand(f.args,f.local);assert.equal(r.handoffState,'incomplete');assert.equal(r.proposedRequest,null);
  const draft=JSON.parse(await fs.readFile(f.file('artifact/draft.json')));assert.ok(draft.validationGaps.includes('deep_article_schema_invalid'));assert.equal(draft.researchQualified,false);
}));
test('DF07 authenticated summaries and prepared gaps remain visible, never public citations',async()=>fixture(async f=>{
  const r=await deepControllerCommand(f.args,f.local);assert.equal(r.handoffState,'incomplete');assert.equal(r.proposedRequest,null);
  const d=JSON.parse(await fs.readFile(f.file('artifact/draft.json')));assert.equal(d.sourceRightsAndVersions[0].publishable,false);assert.deepEqual(d.preparedGaps,f.prepared.packet.gaps);
},p=>{Object.assign(p.sources[0],{visibility:'authenticated_summary',acquisitionMethod:'authenticated_browser_summary',rightsBoundary:'bounded_summary_only',publishable:false});p.gaps=[{reason:'dossier_partial'}];}));
test('DF08 symlinks, hardlinks, public permissions, incomplete JSON and byte bounds reject',async()=>{
  for(const mode of ['symlink','parent_symlink','hardlink','public','partial','oversize']) await fixture(async f=>{
    const input=f.file('model.json');
    if(mode==='symlink'){await fs.rename(input,f.file('actual'));await fs.symlink(f.file('actual'),input);}
    if(mode==='parent_symlink'){await fs.symlink(f.dir,f.file('alias'));f.args[f.args.indexOf('--model-output')+1]=f.file('alias/model.json');}
    if(mode==='hardlink') await fs.link(input,f.file('alias'));
    if(mode==='public') await fs.chmod(input,0o644);
    if(mode==='partial') await fs.writeFile(input,JSON.stringify(f.model));
    if(mode==='oversize') await fs.writeFile(input,'x'.repeat(2*1024*1024+1));
    await assert.rejects(deepControllerCommand(f.args,f.local),/deep_draft/);
  });
});
test('DF09 crash before commit is not resumable as success; partial directory is never taken over',async()=>fixture(async f=>{
  await assert.rejects(deepControllerCommand(f.args,{...f.local,checkpoint:async name=>{if(name==='before_commit') throw new Error('synthetic crash');}}),/deep_draft/);
  const bytes=await fs.readFile(f.file('artifact/draft.json'));await assert.rejects(fs.stat(f.file('artifact/commit.json')),/ENOENT/);
  await assert.rejects(deepControllerCommand(f.args,f.local),/deep_draft/);assert.deepEqual(await fs.readFile(f.file('artifact/draft.json')),bytes);
}));
test('DF10 committed artifact tampering or a different second model cannot replay or overwrite',async()=>{
  for(const mode of ['tamper','different_model','wrong_receipt']) await fixture(async f=>{
    const r=await deepControllerCommand(f.args,f.local);const before=await fs.readFile(f.file('artifact/commit.json'));
    if(mode==='tamper') await fs.appendFile(f.file('artifact/handoff.json'),'x');
    if(mode==='different_model'){f.model.article.summary+=' changed synthetic output';await f.write();}
    await assert.rejects(deepControllerCommand(mode==='different_model' ? f.args : ['inspectDraft','--output',f.file('artifact'),'--receipt-hash',mode==='wrong_receipt' ? 'f'.repeat(64) : r.receiptHash],f.local),/deep_draft/);
    assert.deepEqual(await fs.readFile(f.file('artifact/commit.json')),before);
  });
});
test('DF11 producer rewrite during staging leaves no commit, even when original bytes are restored',async()=>fixture(async f=>{
  await assert.rejects(deepControllerCommand(f.args,{...f.local,checkpoint:async name=>{if(name==='draft.json') await f.write();}}),/deep_draft/);
  await assert.rejects(fs.stat(f.file('artifact/commit.json')),/ENOENT/);
}));
test('DF12 expired arrival retains only a non-submittable draft without refreshing any clocks',async()=>fixture(async f=>{
  f.setClock('2026-10-08T01:31:00Z');const r=await deepControllerCommand(f.args,f.local);assert.equal(r.leaseState,'expired');assert.equal(r.proposedRequest,null);
  const draft=JSON.parse(await fs.readFile(f.file('artifact/draft.json')));assert.equal(draft.handoff.proposedRequest,null);assert.equal(draft.preparedAt,start);
}));
test('DF13 no backdated current clock or future author clock is accepted',async()=>{
  for(const clock of ['2026-10-08T01:00:00Z','2026-10-08T01:18:00Z']) await fixture(async f=>{
    f.setClock(clock);await assert.rejects(deepControllerCommand(f.args,f.local),/deep_draft/);
  });
});

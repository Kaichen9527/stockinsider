// Builtins-only extraction: never imports the native entry, fixture, transport or application.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{stripTypeScriptTypes}from'node:module';
const path='scripts/opportunity-v3/research-v3-author-response-loss-native.test.mjs',s=fs.readFileSync(path,'utf8');
const clock=fs.readFileSync('web/src/lib/research-financial-clock.ts','utf8');
const codec=fs.readFileSync('web/src/lib/research-v3-material-canonical.ts','utf8').split('/** Static schemas only;')[0];
const strip=v=>stripTypeScriptTypes(v,{mode:'strip'}).replace(/^import .*;\n/gm,'').replaceAll('export ','');
const methods=s.slice(s.indexOf('function assertCommittedAuthorRow('),s.indexOf('async function lossSnapshot('));
const invariant=s.slice(s.indexOf('function unchangedInputAndAssignment('),s.indexOf('async function authorResponseLossCase('));
const sandbox={assert,Buffer,createHash};vm.createContext(sandbox);
vm.runInContext(strip(clock)+'\n'+strip(codec)+'\n'+methods+'\n'+invariant+`\n
let count=0;const group=(name,f)=>{f();count++;};const clone=v=>JSON.parse(JSON.stringify(v));
const assignment={assignment_id:'11111111-1111-4111-8111-111111111111',assigned_at:'2025-01-01T00:00:00.000000Z',original_job_deadline:'2030-01-01T00:00:00Z',reservation_expires_at:'2030-01-01T00:00:00Z'};
const submitted={assignmentId:assignment.assignment_id,observation:{invocationId:'synthetic-probe',controllerObservedEndAt:'2025-01-01T00:00:01.123456Z'},rawArticle:{syntheticContractOnly:true}};
const row={assignment_id:assignment.assignment_id,invocation_id:submitted.observation.invocationId,logical_bytes:Buffer.byteLength(completeCanonical(submitted)),payload:clone(submitted),received_at:'2025-01-01T00:00:02.123456Z',result_hash:completeHash(submitted),result_id:'22222222-2222-4222-8222-222222222222'};
group('exact committed payload and original tagged codec',()=>assertCommittedAuthorRow(row,submitted,assignment));
const badRows=[r=>r.assignment_id='wrong',r=>r.invocation_id='wrong',r=>r.payload.rawArticle.syntheticContractOnly=false,r=>r.result_hash='0'.repeat(64),r=>r.logical_bytes++,r=>delete r.received_at,r=>r.unknown=1,r=>r.result_id='not-uuid',r=>r.received_at='2025-01-01T00:00:00Z',r=>r.received_at='2031-01-01T00:00:00Z'];
for(const mutate of badRows)group('committed row negative',()=>{const r=clone(row);mutate(r);assert.throws(()=>assertCommittedAuthorRow(r,submitted,assignment));});
const {invocation_id,...publicRow}=row;const response={result:publicRow,controllerReportOnly:true,dispatchReady:false,modelDispatched:false,publishableResearch:false};
group('exact known private column normalized only after validation',()=>assertRecoveredAuthorRow(response,row,submitted));
for(const change of [r=>r.result.received_at='2025-01-01T00:00:03Z',r=>r.result.extraPersisted=1,r=>delete r.result.result_hash,r=>r.result.result_hash='f'.repeat(64),r=>r.dispatchReady=true,r=>r.extraMetadata=true])group('recovery negative',()=>{const r=clone(response);change(r);assert.throws(()=>assertRecoveredAuthorRow(r,row,submitted));});
group('wrong private invocation cannot be ignored',()=>{const r=clone(row);r.invocation_id='wrong';assert.throws(()=>assertRecoveredAuthorRow(response,r,submitted));});
const before={audit:{a:{count:1,hash:'h'}},ledger:{preparations:[1],revisions:[2]},ledgerHash:'h',charge:{count:2,bytes:200},fd:{opens:9,closes:9},fences:{events:[],invalidations:[],seals:[1]},fencesHash:'f',author:{research_author_assignments_v2:[assignment],research_author_results_v2:[]}};
group('only intended result insertion allowed',()=>{const after=clone(before);after.author.research_author_results_v2=[row];unchangedInputAndAssignment(before,after);});
for(const key of ['audit','ledger','ledgerHash','charge','fd','fences','fencesHash'])group('retained snapshot negative '+key,()=>{const after=clone(before);after[key]=null;assert.throws(()=>unchangedInputAndAssignment(before,after));});
group('assignment clock cannot renew',()=>{const after=clone(before);after.author.research_author_assignments_v2[0].assigned_at='2025-01-01T00:00:02Z';assert.throws(()=>unchangedInputAndAssignment(before,after));});
globalThis.result={kind:'isolated exact-function contract extraction; synthetic rows; not PG/native/article validity',pass:count,fail:0,skip:0,todo:0};
`,sandbox,{timeout:5000});
// Source-bound guards for arm timing, exact receive, finite READ-only recovery and no hidden old test registration.
assert.equal((s.match(/lab\.arm\(/g)||[]).length,1);assert.ok(s.indexOf('lab.arm(')>s.indexOf("if(name==='receive_research_author_result_v2')"));
assert.equal((s.match(/composition\.receiveAuthorResult\(/g)||[]).length,1);assert.equal((s.match(/composition\.readAuthorResult\(/g)||[]).length,1);
assert.ok(s.includes('assert.equal(compositionError,actualQueryError'));assert.ok(s.includes('assert.equal(lab.pendingCount(),0)'));
assert.ok(s.includes("readNames=['read_research_article_input_candidate_v3','read_research_author_assignment_v2','read_research_author_packet_v2','read_research_author_result_v2']"));
assert.ok(!/import[^\n]+(?:durable-native|response-loss-native)\.test/.test(s));
console.log(JSON.stringify({...sandbox.result,sourceBoundaryAssertions:8,entrySha256:createHash('sha256').update(s).digest('hex')}));

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixedBindingInputs,parseBindingCore,bindingCanonical,bindingSha} from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-versioned-input-binding.ts';
import {completeHash,validateCompleteSchema} from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-v3-material-canonical.ts';
const root='/tmp/stockinsider-discovery-release-root-review-oct14/';
const files=['web/src/lib/research-versioned-complete-input.ts','web/src/lib/research-versioned-input-binding.ts','web/src/lib/research-versioned-input-legacy-response.ts','web/src/lib/research-versioned-input-request.ts'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceHash=sha(JSON.stringify(files.map(file=>({file,sha256:sha(fs.readFileSync(root+file))}))));
const executorHash=sha(fs.readFileSync(process.execPath));
function instantiate(s,clock,hashes,p=''){if(Object.hasOwn(s,'const'))return structuredClone(s.const);if(s.type==='object')return Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,instantiate(v,clock,hashes,p+'/'+k)]));if(s.type==='array')return s.prefixItems.map((x,i)=>instantiate(x,clock,hashes,p+'/'+i));if(s.type==='string'&&s.format==='date-time')return clock;if(s.type==='string'&&s.pattern==='^[a-f0-9]{64}$'&&Object.hasOwn(hashes,p))return hashes[p];throw Error('unexpected original schema dialect:'+p);}
for(const symbol of ['2409','2383'])test(symbol+' compatible new execution binding must accept its own financial wrapper',()=>{
 const r=fixedBindingInputs(symbol,'research-article-input-v2'),clock=new Date().toISOString();
 const core={artifactRootId:'original75d-fixed8or6',compiledFingerprintIdentity:executorHash,financialProfile:'oct08_compatible_financial_candidate_v1',inventoryHash:completeHash(r.inventory),schemaTemplateIdentity:bindingSha(bindingCanonical(r.schemaTemplate)),sourceExecutionHash:sourceHash,symbol,validationContract:'research-versioned-input-candidate-v3',wireVersion:'research-article-input-v2'};
 const b=parseBindingCore(bindingCanonical(core));assert.equal(b.core.sourceExecutionHash,sourceHash);
 const fixture=instantiate(r.schemaTemplate,clock,{'/sourceClosureHash':'77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41','/artifactInventoryHash':core.inventoryHash});assert.doesNotThrow(()=>validateCompleteSchema(fixture,r.schemaTemplate,clock));
 assert.equal(fixture.sourceClosureHash,'77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41');
 fixture.sourceClosureHash=b.core.sourceExecutionHash;
 assert.doesNotThrow(()=>validateCompleteSchema(fixture,b.registration.schemaTemplate,clock),'New accepted compatible binding must validate wrapper sourceClosureHash emitted by controller');
});

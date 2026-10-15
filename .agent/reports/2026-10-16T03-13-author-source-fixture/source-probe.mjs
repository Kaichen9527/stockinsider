// Builtins-only extraction of exact fixture statements. No fixture/app imports or DB.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const helper=fs.readFileSync('scripts/opportunity-v3/research-versioned-legal-fixture-helper.mjs','utf8'),native=fs.readFileSync('scripts/opportunity-v3/research-v3-author-durable-native.test.mjs','utf8');
const guard=helper.split('\n').find(l=>l.includes('const sourceProfile=')),extension=helper.split('\n').find(l=>l.includes("if(sourceProfile==='author_packet')"));assert.ok(guard&&extension);
const literal=/metadata=(\{[^\n]+\});/.exec(helper)[1];const original=fs.readFileSync('/tmp/author-source-fixture-o16/research-versioned-legal-fixture-helper.mjs.original','utf8');assert.equal(literal,/metadata=(\{[^\n]+\});/.exec(original)[1]);
let checks=0;const check=work=>{work();checks++;};
const run=options=>{const box={options,assert,url:'https://example.invalid/source-probe',observed:'2026-10-15T00:00:00.123456Z'};vm.runInNewContext(`${guard}\n const metadata=${literal};${extension}\nresult=JSON.stringify(metadata);`,box);return JSON.parse(box.result);};
const base=run({});check(()=>assert.deepEqual(base,run({sourceProfile:'protocol_only'})));
check(()=>assert.deepEqual(Object.keys(base).sort(),['canonical_url','parent_source_url','rights_boundary','subject_scope','content_form','first_observed_at','read_status','synthetic'].sort()));
check(()=>{const m=run({sourceProfile:'author_packet'});for(const[k,v]of Object.entries(base))assert.deepEqual(m[k],v);assert.deepEqual(Object.keys(m).filter(k=>!Object.hasOwn(base,k)).sort(),['visibility','claim_status','catalyst','risk'].sort());assert.equal(m.visibility,'public');assert.equal(m.claim_status,'rumor');assert.equal(m.rights_boundary,'public_citation');for(const k of ['catalyst','risk'])assert.ok(m[k].startsWith('Synthetic local engineering fixture:')&&Buffer.byteLength(m[k])<=2048);});
for(const value of [null,'',false,1,{},[], 'author_packet_extra','public_summary_only'])check(()=>assert.throws(()=>run({sourceProfile:value}),/unknown sourceProfile/));
check(()=>assert.ok(helper.indexOf(guard)<helper.indexOf("execFileSync('pg_config'")));
check(()=>assert.ok(helper.indexOf(extension)<helper.indexOf('INSERT INTO source_raw_documents')));
check(()=>assert.equal((native.match(/sourceProfile:'author_packet'/g)||[]).length,1));
check(()=>assert.ok(native.indexOf(' await assertInitialAuthorSourceProfile(x);')<native.indexOf("x.setStage('author lifecycle: genuine v3 input firstseal')")));
const fn=native.slice(native.indexOf('async function assertInitialAuthorSourceProfile'),native.indexOf('async function lifecycle'));
check(()=>{assert.doesNotMatch(fn,/\b(?:UPDATE|INSERT|DELETE|GRANT|ALTER|CREATE)\b/);assert.match(fn,/x\.audit\.query/);assert.match(fn,/LIMIT 31/);assert.match(fn,/rowHash,row\.row_hash/);assert.match(fn,/observer\.read_only,'on'/);assert.match(fn,/assert\.notEqual\(observer\.pid,writer\)/);});
console.log(JSON.stringify({kind:'builtins-only static source extraction; NOT DB/native',checks,pass:checks,fail:0,skip:0,defaultMetadataLiteralByteExact:true,unknownRejectBeforePerCaseInitdb:true}));

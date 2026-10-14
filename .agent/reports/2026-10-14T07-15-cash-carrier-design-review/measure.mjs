// Review-only fixed fixture measurement. Not a production encoder or API.
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {historicalCashPins as pins} from '/tmp/si-pubtail-o14/web/src/lib/research-historical-cash-pins.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const zipped=readFileSync('/tmp/si-pubtail-o14/scripts/fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz');
assert.equal(sha(zipped),'afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f');
const expanded=gunzipSync(zipped,{maxOutputLength:2000000}); const fixture=JSON.parse(expanded);
assert.equal(fixture.sourceCommit,pins.sourceCommit); assert.equal(fixture.files.length,15);
const expected={'2409':[931023,'823b80038e13779f4155327b3cd7d36b1dc5a833490da1bf692d33845c239590'],'2383':[353803,'5fff5dd7e33ae7da30d8b72890f13414866b7820f54685af38b5cdd95d2b5564']};
const report={kind:'fixture-only representation measurement, not runtime acceptance',node:process.version,sourceCommit:pins.sourceCommit,gzip:{bytes:zipped.length,sha256:sha(zipped)},expandedBytes:expanded.length,uniqueFiles:fixture.files.length,companies:[],mutations:[]};
let uniqueRaw=0; for(const f of fixture.files){const raw=Buffer.from(f.rawBase64,'base64');assert.equal(raw.length,f.pin.bytes);assert.equal(sha(raw),f.pin.sha256);assert.equal(raw.toString('base64'),f.rawBase64); uniqueRaw+=raw.length; raw.fill(0);} report.uniqueRawBytes=uniqueRaw;
for(const symbol of ['2409','2383']){
 const selected=pins.companies[symbol]; let rawTotal=0; let largestRaw=0; let largestEncoded=0;
 const files=selected.files.map(pin=>{const matching=fixture.files.filter(f=>f.pin.path===pin.path);assert.equal(matching.length,1); const f=matching[0];assert.deepEqual(f.pin,pin);rawTotal+=pin.bytes;largestRaw=Math.max(largestRaw,pin.bytes);largestEncoded=Math.max(largestEncoded,f.rawBase64.length);return {path:pin.path,rawBase64:f.rawBase64};});
 const material={schemaVersion:'historical-cash-private-byte-material-v1',financialProfile:pins.profile,symbol,files};
 const encoded=canonical(material); const bytes=Buffer.from(encoded,'utf8'); const digest=sha(bytes);
 assert.equal(bytes.length,expected[symbol][0]);assert.equal(digest,expected[symbol][1]);assert.ok(bytes.length<=1048576);assert.equal(rawTotal,selected.aggregateBytes);assert.ok(largestRaw<=524288);
 report.companies.push({symbol,fileCount:files.length,carrierBytes:bytes.length,carrierSHA256:digest,rawTotal,largestRaw,largestEncoded,carrierPlusRawBytes:bytes.length+rawTotal});
 const variants={unknownKey:canonical({...material,unknown:true}),duplicateKey:encoded.replace(/"symbol":"\d+"/,m=>m+','+m),omitted:canonical({...material,files:files.slice(1)}),extra:canonical({...material,files:[...files,files[0]]}),reordered:canonical({...material,files:[...files].reverse()}),crossCompany:canonical({...material,symbol:symbol==='2409'?'2383':'2409'}),badBase64:canonical({...material,files:files.map((f,i)=>i?f:{...f,rawBase64:'!'+f.rawBase64.slice(1)})}),nonCanonicalWhitespace:encoded+'\n'};
 for(const [name,value] of Object.entries(variants)){const b=Buffer.from(value);assert.notEqual(sha(b),digest); report.mutations.push({symbol,name,bytes:b.length,sha256:sha(b),wouldRejectAt:b.length!==bytes.length?'static_length':'whole_SHA_before_parse'});b.fill(0);}
 bytes.fill(0);
}
report.maxRSSKiB=process.resourceUsage().maxRSS; report.note='No candidate code changed or exercised. Hash mismatch verifies proposed representation identity only. Strings cannot be securely erased.';
console.log(JSON.stringify(report,null,2));

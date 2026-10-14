import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {historicalCashPins as pins} from '/tmp/si-pubtail-o14/web/src/lib/research-historical-cash-pins.ts';
import {projectScenarioCashMaterial as project} from '/tmp/si-pubtail-o14/web/src/lib/research-scenario-cash-material.ts';
import {completeHash} from '/tmp/si-pubtail-o14/scripts/fixtures/research-compatible-financial/legacy-complete-canonical.ts';
const dir='/tmp/si-pubtail-o14/web/src/lib/research-v3-material-schemas';fs.mkdirSync(dir,{recursive:true});
const fixture=JSON.parse(gunzipSync(fs.readFileSync('/tmp/si-pubtail-o14/scripts/fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz'))),raw=new Map(fixture.files.map(f=>[f.pin.path,f.rawBase64]));
const canonical=v=>Array.isArray(v)?`[${v.map(canonical)}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')}}`:JSON.stringify(v);
const clock=new Date().toISOString(),hashPaths=['/projectionHash','/scenarioInputHash','/resultHash','/calculation/inputHash','/calculation/resultHash','/calculation/executionCodeHash'];
const all={};
for(const symbol of ['2409','2383']){
 const carrier=Buffer.from(canonical({schemaVersion:'historical-cash-private-byte-material-v1',financialProfile:pins.profile,symbol,files:pins.companies[symbol].files.map(p=>({path:p.path,rawBase64:raw.get(p.path)}))}));
 const value=project(pins.profile,symbol,carrier,clock,{check(){}}),clocks=[];
 function schema(v,p='',rawMode=true){if(v===clock){clocks.push(p);return{type:'string',format:'date-time'};}if(rawMode&&hashPaths.includes(p))return{type:'string',pattern:'^[a-f0-9]{64}$'};
 if(Array.isArray(v))return{type:'array',prefixItems:v.map((x,i)=>schema(x,p+'/'+i,rawMode))};if(v&&typeof v==='object')return{type:'object',properties:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,schema(x,p+'/'+k,rawMode)]))};return{const:v};}
 const inputSchema=schema(value);const {projection,calculation,...provenance}=structuredClone(value);for(const k of ['projectionHash','scenarioInputHash','resultHash','financialProfile','symbol','artifactReadKnownAt'])delete provenance[k];delete projection.sourceManifestHash;for(const k of ['inputHash','resultHash','executionCodeHash'])delete calculation[k];
 const output={schemaVersion:'research-complete-financial-material-v3-candidate',financialProfile:pins.profile,symbol,artifactReadKnownAt:clock,candidateArtifactInventoryHash:completeHash(pins.companies[symbol].files),financialMaterial:{projection,calculation,provenance},sourceClosureApproved:false,wireDispatchEnabled:false,wholeExecutionClosureBound:false};
 const outputSchema=schema(output,'',false);all[symbol]={rawHashPaths:hashPaths,clockPaths:[...new Set(clocks)],rawBytes:Buffer.byteLength(JSON.stringify(value)),outputBytes:Buffer.byteLength(JSON.stringify(output)),taggedHash:completeHash(output)};
 for(const [name,s] of [['raw',inputSchema],['normalized',outputSchema]]){const bytes=JSON.stringify(s)+'\n';fs.writeFileSync(`${dir}/${symbol}-${name}.json`,bytes);all[symbol][name+'SchemaSha256']=createHash('sha256').update(bytes).digest('hex');}
 fs.writeFileSync(`/tmp/v3-material-o14/${symbol}-raw.json`,JSON.stringify(value));fs.writeFileSync(`/tmp/v3-material-o14/${symbol}-normalized.json`,JSON.stringify(output));
}
fs.writeFileSync('/tmp/v3-material-o14/schema-generation.json',JSON.stringify({clock,all},null,2)+'\n');console.log(JSON.stringify(all,null,2));

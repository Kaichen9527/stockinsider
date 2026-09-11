import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const ts=require('../web/node_modules/typescript');
const source=readFileSync(new URL('../web/src/app/api/radar/daily/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

function harness({enabled=true,snapshot=null,authorized=false,readError=false}={}) {
  const calls={snapshot:0,legacyRead:0,research:0,stages:0};
  class Unavailable extends Error {}
  const modules={
    'next/server':{NextResponse:Response},
    '@/lib/domain':{
      getDailyRadarData:async()=>{calls.research++;return {opportunities:[]};},
      getPersistedRadarStages:async()=>{calls.stages++;return {};},
    },
    '@/lib/radar-projection-read':{
      legacyCorrectnessProjectionEnabled:()=>false,
      loadPublishedRadarProjection:async()=>{calls.legacyRead++;return null;},
      RadarProjectionUnavailableError:Unavailable,
    },
    '@/lib/internal-auth':{requireExactInternalBearer:()=>authorized},
    '@/lib/radar-producer-payload':{compactProducerRadarPayload:value=>value},
    '@/lib/radar-response-policy':{radarResponseHeaders:()=>({'cache-control':'no-store'})},
    '@/lib/radar-public-snapshot':{
      radarPublicSnapshotsEnabled:()=>enabled,
      loadLatestRadarPublicSnapshot:async()=>{calls.snapshot++;if(readError)throw new Error('read_failed');return snapshot;},
    },
    '@/lib/candidate-stage-contract':{hasCandidateStageCards:()=>true},
    '@/lib/radar-stage-pagination':{isCandidateStageKey:()=>false,candidateStageCounts:()=>({found:0,waiting:0,actionable:0})},
  };
  const exports={};
  vm.runInNewContext(compiled,{exports,require:id=>id.startsWith('node:')?require(id):(modules[id]??(()=>{throw new Error(`unexpected dependency ${id}`);})()),Response,Date});
  return {calls,GET:headers=>exports.GET({headers:new Headers(headers),nextUrl:new URL('http://localhost/api/radar/daily')})};
}
test('actual public route snapshot miss is 503 with zero legacy/research queries',async()=>{
  const h=harness();const response=await h.GET();
  assert.equal(response.status,503);assert.equal((await response.json()).error,'radar_projection_unavailable');
  assert.deepEqual(h.calls,{snapshot:1,legacyRead:0,research:0,stages:0});
});
test('snapshot failure never falls through to research',async()=>{
  const h=harness({readError:true});assert.equal((await h.GET()).status,500);
  assert.equal(h.calls.research,0);assert.equal(h.calls.legacyRead,0);
});
test('published public snapshot remains single-read and ETag cacheable',async()=>{
  const h=harness({snapshot:{contentAsOf:new Date().toISOString(),publishedAt:new Date().toISOString(),stale:false,payload:{opportunities:[]}}});
  const response=await h.GET();assert.equal(response.status,200);assert.ok(response.headers.get('etag'));
  assert.deepEqual(h.calls,{snapshot:1,legacyRead:0,research:0,stages:0});
});
test('authenticated tracked producer retains research authority',async()=>{
  const h=harness({authorized:true});assert.equal((await h.GET({'x-stockinsider-projection-source':'tracked-producer'})).status,200);
  assert.deepEqual(h.calls,{snapshot:0,legacyRead:0,research:1,stages:0});
});
test('spoofed tracked producer is rejected before any read',async()=>{
  const h=harness();assert.equal((await h.GET({'x-stockinsider-projection-source':'tracked-producer'})).status,401);
  assert.deepEqual(h.calls,{snapshot:0,legacyRead:0,research:0,stages:0});
});
test('disabled snapshot mode preserves the existing legacy path',async()=>{
  const h=harness({enabled:false});assert.equal((await h.GET()).status,200);
  assert.deepEqual(h.calls,{snapshot:0,legacyRead:1,research:1,stages:0});
});

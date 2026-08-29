import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import fs from 'node:fs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const runtime=(file)=>require(path.join(root,'scripts/runtime',file));

function declaredMigrationPaths(source,constantName) {
  const body=source.match(new RegExp(`const ${constantName}\\s*=\\s*(?:Object[.]freeze[(])?([\\s\\S]*?\\])[;)]`,'u'))?.[1];
  assert.ok(body,`${constantName} migration declaration`);
  return [...body.matchAll(/['"](migrations\/[^'"]+[.]sql)['"]/gu)].map((match)=>match[1]);
}

test('V31621 operator migration plan exactly matches the reviewed apply chain',()=>{
  const plan=fs.readFileSync(path.join(root,'scripts/opportunity-v3/migration-plan.mjs'),'utf8');
  const apply=fs.readFileSync(path.join(root,'scripts/opportunity-v3/apply-reviewed-migrations.mjs'),'utf8');
  const planned=declaredMigrationPaths(plan,'migrationPaths');
  const reviewed=declaredMigrationPaths(apply,'MIGRATIONS');
  assert.deepEqual(planned,reviewed,'the displayed production plan cannot omit or reorder a reviewed migration');
  assert.equal(planned.at(-1),'migrations/20260830_v320_expired_unclaimed_run_reaper.sql');
});

test('V3.18 candidate retention reuses only the preceding immutable terminal ledger',()=>{
  const migration=fs.readFileSync(path.join(root,
    'migrations/20260822_candidate_ledger_retention_v3_18.sql'),'utf8');
  assert.doesNotMatch(migration,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(migration,/result[.]result_json->'candidates'/u);
  assert.match(migration,/candidateLedgerContract/u);
  assert.match(migration,/jsonb_array_length\(v_prior_ledger\)>60/u);
  assert.match(migration,/REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner/u);
});

test('V31621 projection repair separates immutable content cutoff from reviewed evaluation order',()=>{
  const migration=fs.readFileSync(path.join(root,
    'migrations/20260817_projection_evaluation_supersession_v3_16_21.sql'),'utf8');
  assert.doesNotMatch(migration,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(migration,/NEW[.]as_of<v_latest[.]as_of/u);
  assert.match(migration,/v_new_evaluated_at<=v_latest_evaluated_at/u);
  assert.match(migration,/NEW[.]producer_commit_sha=v_latest[.]producer_commit_sha/u);
  assert.match(migration,/projection_release_identity_invalid/u);
  assert.match(migration,/REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner/u);
});

test('V31621 production-cardinality repair keeps pooler-safe chunks and snapshots roster integrity once',()=>{
  const migration=fs.readFileSync(path.join(root,
    'migrations/20260817_official_ingestion_roster_chunk_snapshot_v3_16_21.sql'),'utf8');
  const worker=fs.readFileSync(path.join(root,'scripts/runtime/auth-source-worker-cli.js'),'utf8');
  assert.doesNotMatch(migration,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(migration,/official_ingestion_mixed_acquisition_time/u);
  assert.match(migration,/opportunity_authority_selected_stream_count_v3_internal/u);
  assert.match(migration,/resolve_legacy_instrument_symbol_authority_v3_13_internal/u);
  assert.doesNotMatch(migration,/jsonb_array_length\(p_items\)>20/u,
    'the database repair must not silently redefine the existing chunk contract');
  const chunkSizes=[...worker.matchAll(/^\s*\['(?:trading_sessions|financial_facts|price_observations|corporate_action_snapshots|reported_valuations)'[^\n]+,20\],?$/gmu)];
  assert.ok(chunkSizes.length>=5,'all official datasets retain the reviewed 20-row pooler bound');
});

function claim(runId='00000000-0000-4000-8000-000000000001') {
  return {runId,jobId:'00000000-0000-4000-8000-000000000002',
    ownerToken:'00000000-0000-4000-8000-000000000003'};
}

function immutableStore() {
  const rows=new Map();
  return {
    rows,
    read:async({provider,requestKey,sourceCutoff})=>rows.get(`${provider}:${requestKey}:${sourceCutoff}`)??null,
    freeze:async(candidate)=>{
      const key=`${candidate.provider}:${candidate.requestKey}:${candidate.sourceCutoff}`;
      const prior=rows.get(key);
      if(prior)return prior.evidenceRoot===candidate.evidenceRoot
        ?{disposition:'reused',envelope:prior}:{disposition:'conflict',envelope:prior};
      const {jobId:_jobId,ownerToken:_ownerToken,...envelope}=candidate;
      rows.set(key,Object.freeze(envelope));
      return {disposition:'appended',envelope};
    },
  };
}

test('V31621 provider acquisition freezes true fetched time and exact response bytes',async()=>{
  const provider=runtime('provider-acquisition-v31621.js');
  const store=immutableStore();let fetches=0;
  const times=[new Date('2026-08-17T01:00:00.100Z'),new Date('2026-08-17T01:00:02.900Z')];
  const result=await provider.acquireFrozenProviderEnvelope({provider:'official_tw_market',stage:'facts_refresh',
    sourceCutoff:'2026-08-16T08:00:00Z',requestMaterial:{symbols:['2330']},claim:claim(),
    readFrozen:store.read,freeze:store.freeze,now:()=>times.shift(),fetchImpl:async()=>{
      fetches+=1;return new Response('{"close":123}',{status:200,headers:{'content-type':'application/json'}});},
    acquire:async({fetchImpl})=>({schema:'fixture',body:await (await fetchImpl('https://authority.test')).json()}),
  });
  assert.equal(fetches,1);assert.equal(result.envelope.fetchedAt,'2026-08-17T01:00:02Z');
  assert.notEqual(result.envelope.fetchedAt,result.envelope.sourceCutoff,'fetchedAt must never be backfilled to cutoff');
  assert.equal(result.envelope.responseBytes,13);assert.equal(result.envelope.terminalStatus,'complete');
  assert.equal(Object.isFrozen(result.envelope.normalizedPayload),true);
  assert.equal(Object.isFrozen(result.envelope.normalizedPayload.body),true);
  assert.equal(provider.providerEnvelopeEligibleAt(result.envelope,'2026-08-17T01:00:01Z'),false,
    'a historical evaluation cannot consume evidence fetched in its future');
  assert.equal(provider.providerEnvelopeEligibleAt(result.envelope,'2026-08-17T01:00:03Z'),true);
});

test('V31621 same request reuses immutable acquisition and produces identical evidence without refetch',async()=>{
  const provider=runtime('provider-acquisition-v31621.js');
  const store=immutableStore();let fetches=0;
  const acquire=()=>provider.acquireFrozenProviderEnvelope({provider:'official_coarse_market',stage:'candidate_funnel',
    sourceCutoff:'2026-08-17T00:00:00Z',requestMaterial:{universe:'tw_all'},claim:claim(),
    readFrozen:store.read,freeze:store.freeze,now:()=>new Date('2026-08-17T01:00:00Z'),
    fetchImpl:async()=>{fetches+=1;return new Response('stable-authority-bytes',{status:200});},
    acquire:async({fetchImpl})=>({body:await (await fetchImpl('https://authority.test')).text()}),
  });
  const first=await acquire();const second=await acquire();
  assert.equal(first.disposition,'appended');assert.equal(second.disposition,'reused');
  assert.equal(fetches,1);assert.equal(first.envelope.evidenceRoot,second.envelope.evidenceRoot);
  assert.equal(first.envelope.normalizedPayloadSha256,second.envelope.normalizedPayloadSha256);
});

test('V31621 partial retry fetches only missing request keys and quarantines a response conflict',async()=>{
  const provider=runtime('provider-acquisition-v31621.js');
  const store=immutableStore();let fetches=0;
  const acquire=(requestMaterial)=>provider.acquireFrozenProviderEnvelope({provider:'approved_sources',stage:'source_sync',
    sourceCutoff:'2026-08-17T00:00:00Z',requestMaterial,claim:claim(),readFrozen:store.read,freeze:store.freeze,
    now:()=>new Date('2026-08-17T01:00:00Z'),fetchImpl:async()=>{fetches+=1;return new Response(JSON.stringify(requestMaterial));},
    acquire:async({fetchImpl})=>({value:await (await fetchImpl('https://authority.test')).json()}),
  });
  const first=await acquire({profilePage:1});
  await acquire({profilePage:1});
  const missing=await acquire({profilePage:2});
  assert.equal(fetches,2,'the completed key is reused while only the missing key is acquired');
  assert.notEqual(first.envelope.requestKey,missing.envelope.requestKey);
  const conflict={...first.envelope,normalizedPayload:{tampered:true}};
  conflict.normalizedPayloadSha256=runtime('codec.js').sha256(runtime('codec.js').canonicalJson(conflict.normalizedPayload));
  await assert.rejects(()=>provider.acquireFrozenProviderEnvelope({provider:'approved_sources',stage:'source_sync',
    sourceCutoff:first.envelope.sourceCutoff,requestMaterial:{profilePage:1},claim:claim(),
    readFrozen:async()=>null,freeze:async()=>({disposition:'conflict',envelope:first.envelope}),
    now:()=>new Date('2026-08-17T01:00:01Z'),fetchImpl:async()=>new Response(JSON.stringify(conflict.normalizedPayload)),
    acquire:async({fetchImpl})=>await (await fetchImpl('https://authority.test')).json(),
  }),/provider acquisition conflict/u);
});

test('V31621 provider failure diagnostic cannot echo URI, SQL, payload or secret',async()=>{
  const provider=runtime('provider-acquisition-v31621.js');const store=immutableStore();
  const secret='postgresql://user:secret@example.test/database';
  const result=await provider.acquireFrozenProviderEnvelope({provider:'official_tw_market',stage:'facts_refresh',
    sourceCutoff:'2026-08-17T00:00:00Z',requestMaterial:{symbols:['2330']},claim:claim(),
    readFrozen:store.read,freeze:store.freeze,now:()=>new Date('2026-08-17T01:00:00Z'),
    fetchImpl:async()=>new Response('{}'),acquire:async()=>{throw new Error(`SQL payload failed at ${secret}`);},
  });
  const serialized=JSON.stringify(result);
  assert.equal(result.envelope.terminalStatus,'provider_failed');
  assert.equal(serialized.includes(secret),false);assert.equal(serialized.includes('SQL payload'),false);
  assert.equal(provider.validateStoredProviderEnvelope({...result.envelope,actionEligible:true}),null,
    'a failed terminal cannot become action eligible through a malformed storage response');
  await assert.rejects(()=>provider.acquireFrozenProviderEnvelope({provider:'official_tw_market',stage:'facts_refresh',
    sourceCutoff:'2026-08-17T00:00:00Z',requestMaterial:{symbols:['2330']},claim:claim(),
    readFrozen:async()=>null,freeze:async()=>({disposition:'unexpected',envelope:result.envelope}),
    now:()=>new Date('2026-08-17T01:00:00Z'),fetchImpl:async()=>new Response('{}'),
    acquire:async()=>({ok:true}),
  }),/persistence disposition/u);
});

test('V31621 action authority commits to the complete provider lineage rather than one fact fetch',()=>{
  const {providerAcquisitionLineageHealth}=runtime('auth-source-worker-cli.js');
  const member=(provider,actionEligible=true)=>({provider,requestKey:'a'.repeat(64),evidenceRoot:
    runtime('codec.js').sha256(provider),fetchedAt:'2026-08-17T01:00:00Z',terminalStatus:'complete',actionEligible});
  const lineage=[member('approved_sources',false),member('legacy_radar'),member('official_coarse_market'),
    member('official_tw_market')];
  const ready=providerAcquisitionLineageHealth(lineage,'2026-08-17T01:00:01Z',{ready:true});
  assert.equal(ready.authoritative,true);assert.match(ready.evidenceRoot,/^[0-9a-f]{64}$/u);
  assert.deepEqual(ready.blockers,[]);
  const missingLegacy=providerAcquisitionLineageHealth(lineage.filter((row)=>row.provider!=='legacy_radar'),
    '2026-08-17T01:00:01Z',{ready:true});
  assert.equal(missingLegacy.authoritative,true,
    'a predecessor Radar snapshot is never a KOL-first nomination or action authority');
  const staleLegacy=providerAcquisitionLineageHealth([...lineage,{...member('legacy_radar'),terminalStatus:'provider_failed'}],
    '2026-08-17T01:00:01Z',{ready:true});
  assert.equal(staleLegacy.authoritative,true,
    'a stale readonly compatibility payload cannot block a new reviewed producer run');
  const future=providerAcquisitionLineageHealth(lineage,'2026-08-17T00:59:59Z',{ready:true});
  assert.equal(future.authoritative,false);assert.ok(future.blockers.includes('frozen_acquisition_future_evidence'));
  const legacy={opportunities:[],scenarioUpsideCandidates:[],earlyWatchlist:[],recentFormal7d:[],
    fallbackOpportunities90d:[],hotTracking:[],sourceAcquisitionHealth:{acquisitionAuthority:'authoritative',
      acquisitionEvidenceRoot:'f'.repeat(64)}};
  const published=runtime('compact-radar-projection.js').publishCompactRadarProjection({decisions:[],legacyPayload:legacy,
    window:'home',asOf:'2026-08-17T01:00:01Z',evaluatedAt:'2026-08-17T01:00:01Z',
    publishedAt:'2026-08-17T01:00:01Z',contentAsOf:'2026-08-17T01:00:01Z',freshnessSchedule:[],
    producerIdentity:{commitSha:'a'.repeat(40)},schemaVersion:'legacy-radar-v3.14.0'});
  assert.equal(published.payload.sourceAcquisitionHealth,null,
    'a captured predecessor projection can never mint current frozen-acquisition authority');
});

test('V31621 effective public and internal health disables actions for every authority mismatch but retains last-good research',async()=>{
  const {deriveEffectiveProjectionHealth}=await import('../../web/src/lib/opportunity-v3/effective-health.ts');
  const freshness={status:'fresh',reason:'on_schedule',missedExpectedRuns:0,integrityStatus:'valid',
    freshnessStatus:'fresh',researchVisibility:'live',actionAuthority:'enabled',contentAsOf:'2026-08-17T01:00:00Z',
    evaluatedAt:'2026-08-17T01:00:00Z',publishedAt:'2026-08-17T01:00:01Z',nextExpectedAt:null,
    calendarAuthority:'tw_trading_sessions_v3',actionsEnabled:true};
  const authority={freshness,checksumMatches:true,runtimeHealthy:true,releaseCompatible:true,
    manifestCompatible:true,migrationCompatible:true,acquisitionAuthoritative:true};
  const ready=deriveEffectiveProjectionHealth(authority);
  assert.equal(ready.actionsEnabled,true);assert.deepEqual(ready.actionBlockers,[]);
  for(const [key,blocker] of [
    ['runtimeHealthy','runtime_doctor_failed'],['releaseCompatible','consumer_producer_incompatible'],
    ['manifestCompatible','manifest_incompatible'],['migrationCompatible','migration_incompatible'],
    ['acquisitionAuthoritative','frozen_acquisition_authority_unavailable'],
  ]){
    const degraded=deriveEffectiveProjectionHealth({...authority,[key]:false});
    assert.equal(degraded.actionsEnabled,false);assert.equal(degraded.actionAuthority,'disabled');
    assert.equal(degraded.researchVisibility,'last_good_readonly');assert.ok(degraded.actionBlockers.includes(blocker));
  }
  const conflict=deriveEffectiveProjectionHealth({...authority,checksumMatches:false});
  assert.equal(conflict.integrityStatus,'conflict');assert.equal(conflict.researchVisibility,'none');
  assert.deepEqual(conflict.actionBlockers,['checksum_conflict']);
});

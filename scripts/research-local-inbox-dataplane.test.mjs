import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localInboxProfile, localProcessEnvironment, redactLocalLogChunks, verifyLocalInboxDataPlane } from './research-local-inbox-dataplane.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('local profile selects existing SQL and never seeds observed authority or invents RPCs',async()=>{
  const profile=await localInboxProfile(root);
  assert.equal(profile.routines.length,3);
  assert.ok(profile.routines.every(row=>row.body.length>200));
  assert.doesNotMatch(profile.sql,/INSERT INTO|trusted\s*=\s*true/iu);
  assert.ok(profile.definitions.every(row=>/^[0-9a-f]{64}$/.test(row.definitionSha256)));
  assert.equal(profile.readOnlyTables.length,9);
  assert.ok(profile.readOnlyTables.includes('candidate_issuer_document_domains_v6'));
  assert.ok(profile.readOnlyTables.includes('research_deep_jobs_v1'));
  assert.match(profile.sql,/receipt_id UUID REFERENCES public.candidate_dossier_submission_receipts/u);
  assert.doesNotMatch(profile.sql,/GRANT (?:ALL|INSERT|UPDATE|DELETE) ON public\./u);
});
test('local child environment excludes inherited credentials and production writer identity',()=>{
  const env=localProcessEnvironment({PATH:'/usr/bin',HTTPS_PROXY:'https://proxy.invalid',SSL_CERT_FILE:'/test/ca.pem',INTERNAL_API_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic',STOCKINSIDER_WRITER_RELEASE_ID:'a'.repeat(40)});
  assert.deepEqual(env,{PATH:'/usr/bin',HTTPS_PROXY:'https://proxy.invalid',SSL_CERT_FILE:'/test/ca.pem'});
});
const enabled=process.env.RESEARCH_LOCAL_DATAPLANE_VERIFY==='enabled';
test('actual attributed relay through real local Next/Supabase/PostgREST/PostgreSQL',{
  skip:!enabled && 'explicit local development verification not enabled',timeout:120000,
},async t=>{
  const report=await verifyLocalInboxDataPlane({root,
    artifacts:process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS,
    pgBin:process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN,
    postgrestBin:process.env.RESEARCH_LOCAL_DATAPLANE_POSTGREST_BIN,
    check:(name,fn)=>t.test(name,fn),
  });
  assert.equal(report.passed,true);assert.equal(report.checks.length,9);
});

// Synthetic memory-only values; never real environment credentials.
test('joined log removes ephemeral values across every pipe-chunk split',()=>{
  const secrets=['synthetic-internal-key-0123456789','synthetic-service-jwt.header-payload-signature','synthetic-jwt-secret-9876543210'];
  const perChunk=chunk=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[ephemeral credential]'),chunk);
  for(const secret of secrets)for(let cut=1;cut<secret.length;cut++){
    const chunks=[perChunk('prefix '+secret.slice(0,cut)),perChunk(secret.slice(cut)+' suffix')];
    const saved=redactLocalLogChunks(chunks,secrets);
    assert.ok(!saved.includes(secret),`credential recovered at synthetic split ${cut}`);
    assert.ok(saved.includes('prefix ') && saved.includes(' suffix'));
  }
  const all=secrets.join('|');
  const saved=redactLocalLogChunks([...all].map(perChunk),secrets);
  assert.ok(secrets.every(secret=>!saved.includes(secret)));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localInboxProfile, localProcessEnvironment, verifyLocalInboxDataPlane } from './research-local-inbox-dataplane.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('local profile selects existing SQL and never seeds observed authority or invents RPCs',async()=>{
  const profile=await localInboxProfile(root);
  assert.equal(profile.routines.length,3);
  assert.ok(profile.routines.every(row=>row.body.length>200));
  assert.doesNotMatch(profile.sql,/INSERT INTO|trusted\s*=\s*true/iu);
  assert.ok(profile.definitions.every(row=>/^[0-9a-f]{64}$/.test(row.definitionSha256)));
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
  assert.equal(report.passed,true);assert.equal(report.checks.length,8);
});

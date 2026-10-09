import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';
import ts from '../web/node_modules/typescript/lib/typescript.js';

test('exact approval retry survives effective time; changed input does not replay', async () => {
  const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const body = { kind: 'approval', effectiveFrom: '2026-09-01T00:00:00Z', approvedAt: '2026-08-31T00:00:00Z' };
  const db = { from() { const filters = {}; const result = () => ({ error: null, data:
    filters.input_hash === hash(body) ? [{ record_hash: 'receipt', kind: 'approval', input_payload: body, payload: { retained: true } }]
      : filters.record_hash ? null : [] });
    const query = { then: (yes,no) => Promise.resolve(result()).then(yes,no), maybeSingle: async () => result() };
    for (const method of ['select','eq','limit']) query[method] = (key,value) => { if(method==='eq')filters[key]=value;return query; };
    return query;
  } };
  const deps = { 'next/server': { NextResponse: { json: (body,options) => ({ body,status:options?.status||200 }) } },
    '@/lib/internal-auth': { requireInternalAuth: () => ({ ok:true,authSource:'strategy_approval_key' }) },
    '@/lib/supabase-server': { getSupabaseServerClient:()=>db },
    '@/lib/research-agent-qualification': { researchCanonicalHash:hash }, '@/lib/research-strategy-governance': {}, '@/lib/research-paper-books': {} };
  const exports = {};
  const source = fs.readFileSync(new URL('../web/src/app/api/internal/research-strategy-record/route.ts',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:(name)=>{assert.ok(name in deps,name);return deps[name];},Date});
  const request = (data) => ({ headers:new Headers({authorization:'Bearer fixture'}),json:async()=>data });
  const replay = await exports.POST(request(body));
  assert.equal(replay.status,200); assert.equal(replay.body.idempotentReplay,true);
  const changed = await exports.POST(request({...body,effectiveFrom:'2026-09-02T00:00:00Z'}));
  assert.equal(changed.status,409); assert.notEqual(changed.body.idempotentReplay,true);
});

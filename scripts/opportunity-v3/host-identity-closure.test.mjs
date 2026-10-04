import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../web/src/lib/opportunity-v3/canonical.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const change=path.join(root,'.loop-engineering/state/changes/source-led-opportunity-engine-v3');
const require=createRequire(import.meta.url);
const runner=require('../model-runner-v3/runner.js');
const pins=JSON.parse(fs.readFileSync(path.join(change,'model-runner-host-pins-v3.json'),'utf8'));
const inventory=JSON.parse(fs.readFileSync(path.join(change,'acceptance-tests.json'),'utf8'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const digest=(x)=>createHash('sha256').update(x).digest('hex');
test('all canonical inventory commands still match actual package scripts',()=>{
 for(const [name,value] of inventory.scriptValueRows){
   if(name.startsWith('web:'))continue;
   assert.equal(pkg.scripts[name],value,name);
 }
 assert.equal(digest(canonicalJson(inventory.scriptValueRows)),inventory.scriptValueRowsSha256);
 assert.equal(digest(canonicalJson(inventory.ownerRows)),inventory.ownerRowsSha256);
});
test('MR3-019 freezes the actual candidate identity without changing denials',()=>{
 const row=inventory.cases.find(x=>x.id==='MR3-019');
 const raw=fs.readFileSync(path.join(change,'model-runner-host-pins-v3.json'));
 assert.ok(row.expected.includes(pins.fixtureVersion));
 assert.ok(row.expected.includes(digest(raw.subarray(0,-1))));
 assert.ok(row.setup.includes((raw.length-1).toLocaleString('en-US')+'-byte canonical host fixture'));
 assert.ok(row.expected.includes('mismatch is exit 5'));
 assert.ok(row.expected.includes('observable race authorizes no result'));
 assert.ok(row.expected.includes('no learned/fallback value exists'));
});
test('human-readable MR3-019 matches the unchanged machine-owned criterion',()=>{
 const row=inventory.cases.find(x=>x.id==='MR3-019');
 const md=fs.readFileSync(path.join(change,'acceptance-tests.md'),'utf8');
 assert.ok(md.includes(row.setup));assert.ok(md.includes(row.expected));
});
test('design binds the exact candidate runner identity',()=>{
 const design=fs.readFileSync(path.join(change,'design.md'),'utf8');
 assert.ok(design.includes(runner.MODEL_RUNNER_IDENTITY_SHA256));
 assert.ok(design.includes(Buffer.byteLength(canonicalJson(runner.MODEL_RUNNER_IDENTITY))+'-byte identity'));
});
test('shadow doctor and model aggregate use the same exact candidate pin',()=>{
 const shadow=fs.readFileSync(path.join(root,'scripts/opportunity-v3/shadow-activation-gate.mjs'),'utf8');
 assert.ok(shadow.includes("'"+pins.fixtureVersion+"'"));
 assert.ok(pkg.scripts['verify:source-led-opportunity-v3:model-runner'].endsWith('--require-host-pin '+pins.fixtureVersion));
 assert.ok(!shadow.includes('model-runner-host-pins-v3.18'));
});

test('active tagged catalog identities bind the actual catalog bytes',()=>{
 const bytes=fs.readFileSync(path.join(change,'active-artifact-catalog-v3.json'));
 const catalog=JSON.parse(bytes);let count=0;
 for(const name of catalog.activeFiles){
  if(!name.endsWith('.md'))continue;
  const text=fs.readFileSync(path.join(change,name),'utf8');
  for(const match of text.matchAll(/<!-- GOV-004-AUTHORITY (\{[^\r\n]*\}) -->/gu)){
   const row=JSON.parse(match[1]);
   if(Object.hasOwn(row,'catalogSha256')){assert.equal(row.catalogSha256,digest(bytes),name);assert.equal(row.catalogBytes,bytes.length,name);count++;}
  }
 }
 assert.ok(count>0,'the real catalog identity tags must not disappear');
});

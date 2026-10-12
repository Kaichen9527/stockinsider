import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const require=createRequire(import.meta.url);
const {loadHostPins,PIN_FIXTURE_BYTES,PIN_FIXTURE_SHA256}=require('../model-runner-v3/hostPreflight');
const {canonicalJson}=require('../model-runner-v3/canonicalJson');
const {MODEL_RUNNER_IDENTITY,MODEL_RUNNER_IDENTITY_SHA256}=require('../model-runner-v3/runner');
const change='.loop-engineering/state/changes/source-led-opportunity-engine-v3/';
const fixture=change+'model-runner-host-pins-v3.json';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('installation exact bytes, identity, normative mirrors and command table are coherent',()=>{
 const bytes=readFileSync(fixture),pins=loadHostPins(fixture);
 assert.equal(bytes.length,PIN_FIXTURE_BYTES);assert.equal(hash(bytes.subarray(0,-1)),PIN_FIXTURE_SHA256);
 assert.equal(pins.approvalAuthority,null);assert.equal(pins.fixtureVersion,'model-runner-host-pins-v3.25');
 assert.equal(MODEL_RUNNER_IDENTITY_SHA256,hash(canonicalJson(MODEL_RUNNER_IDENTITY)));
 const identity=Object.fromEntries(MODEL_RUNNER_IDENTITY);assert.equal(identity.hostPinFixtureSha256,PIN_FIXTURE_SHA256);
 assert.equal(identity.hostPinVersion,pins.fixtureVersion);
 const contract=readFileSync(change+'model-runner-contract.md','utf8');
 assert.ok(contract.includes(canonicalJson(MODEL_RUNNER_IDENTITY)));
 assert.ok(contract.includes('exactly '+Buffer.byteLength(canonicalJson(MODEL_RUNNER_IDENTITY))+' UTF-8 bytes'));
 const inventory=JSON.parse(readFileSync(change+'acceptance-tests.json'));
 assert.equal(hash(canonicalJson(inventory.scriptValueRows)),inventory.scriptValueRowsSha256);
 const pkg=JSON.parse(readFileSync('package.json')),web=JSON.parse(readFileSync('web/package.json'));
 for(const [name,command] of inventory.scriptValueRows)assert.equal((name.startsWith('web:')?web:pkg).scripts[name.replace(/^web:/,'')],command);
 const md=readFileSync(change+'acceptance-tests.md','utf8');
 for(const row of inventory.cases){const cells=[row.id,row.requirement,row.layer,row.setup,row.expected];assert.ok(md.includes('| '+cells.join(' | ')+' |'),row.id+' exact markdown mirror');}
 const base=JSON.parse(execFileSync('/usr/bin/git',['show','169aad1b6cfa747f78ae3464b614f43c0749d806:'+change+'acceptance-tests.json'],{encoding:'utf8'}));
 assert.deepEqual(inventory.ownerRows,base.ownerRows);assert.deepEqual(inventory.verificationPartition,base.verificationPartition);
 for(const row of inventory.cases)if(!['MR3-016','MR3-019','HYB-007'].includes(row.id))assert.deepEqual(row,base.cases.find(x=>x.id===row.id));
 const catalogBytes=readFileSync(change+'active-artifact-catalog-v3.json');
 for(const file of ['design.md','acceptance-evidence-contract.md'])assert.ok(readFileSync(change+file,'utf8').includes('"catalogBytes":'+catalogBytes.length+',"catalogSha256":"'+hash(catalogBytes)+'"'));
});
test('active pin loader rejects FIFO, symlink, truncation and growth without blocking or accepting a prefix',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'si-pin-loader-'));
 try {
  const regular=path.join(dir,'pin.json');writeFileSync(regular,readFileSync(fixture));
  const link=path.join(dir,'link');symlinkSync(regular,link);assert.throws(()=>loadHostPins(link),e=>e.exit===5);
  writeFileSync(regular,readFileSync(fixture).subarray(0,-1));assert.throws(()=>loadHostPins(regular),e=>e.exit===5);
  writeFileSync(regular,Buffer.concat([readFileSync(fixture),Buffer.from('x')]));assert.throws(()=>loadHostPins(regular),e=>e.exit===5);
  const fifo=path.join(dir,'fifo');assert.equal(spawnSync('/usr/bin/mkfifo',[fifo]).status,0);
  const module=path.resolve('scripts/model-runner-v3/hostPreflight.js');
  const child=spawnSync(process.execPath,['-e',`try{require(${JSON.stringify(module)}).loadHostPins(process.argv[1]);process.exit(99)}catch(e){process.exit(e.exit||98)}`,fifo],{timeout:2000,encoding:'utf8'});
  assert.equal(child.status,5);assert.equal(child.signal,null);
  writeFileSync(regular,readFileSync(fixture));
  const growth=`const fs=require('node:fs'),old=fs.readSync;let once=false;fs.readSync=(...args)=>{const n=old(...args);if(!once){once=true;fs.appendFileSync(process.argv[1],'x')}return n};try{require(${JSON.stringify(module)}).loadHostPins(process.argv[1]);process.exit(99)}catch(e){process.exit(e.exit||98)}`;
  const raced=spawnSync(process.execPath,['-e',growth,regular],{timeout:2000,encoding:'utf8'});assert.equal(raced.status,5);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

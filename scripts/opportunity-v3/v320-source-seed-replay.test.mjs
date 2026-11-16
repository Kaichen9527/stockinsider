import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { SOURCE_SEED_MIGRATION, lockSatisfiedV320SourceSeed, verifySatisfiedV320SourceSeed } from './v320-source-seed-replay.mjs';

const migration=()=>({relativePath:SOURCE_SEED_MIGRATION,bytes:fs.readFileSync(SOURCE_SEED_MIGRATION)});
const complete={identities:4,authorities:4,bindings:1,functionExact:true,executeClosed:true};
const client=(...observations)=>{
  const calls=[];
  return {calls,async query(sql,params) {
    calls.push(sql);
    if(sql.startsWith('LOCK TABLE'))return {};
    assert.ok(sql.startsWith('WITH wanted AS'));
    assert.equal(JSON.parse(params[0]).length,4);
    assert.equal(params.length,5);
    return {rows:[observations.shift()]};
  }};
};
test('retains only a complete source seed verified under the migration lock and again before commit',async()=>{
  const exact=client(complete,complete,complete);
  const observed=await lockSatisfiedV320SourceSeed(exact,migration());
  assert.ok(observed);
  await verifySatisfiedV320SourceSeed(exact,observed);
  assert.equal(exact.calls.length,4);
  const changed=client(complete,{...complete,executeClosed:false});
  await assert.rejects(lockSatisfiedV320SourceSeed(changed,migration()),/v320_source_seed_replay_checkpoint_changed/);
});
test('leaves incomplete or untrusted seed installations to the original migration',async()=>{
  for(const [key,value] of Object.entries({identities:3,authorities:3,bindings:0,functionExact:false,executeClosed:false})){
    const incomplete=client({...complete,[key]:value});
    assert.equal(await lockSatisfiedV320SourceSeed(incomplete,migration()),null);
    assert.equal(incomplete.calls.length,1);
  }
  const edited=migration();
  edited.bytes=Buffer.concat([edited.bytes,Buffer.from('\n')]);
  await assert.rejects(lockSatisfiedV320SourceSeed(client(),edited),/v320_source_seed_replay_source_changed/);
});

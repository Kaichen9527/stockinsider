import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Arithmetic reachability witness, not PostgreSQL execution or an acceptance pass.
// Source guards keep the witness tied to the frozen candidate's actual-only rule.
const sql=readFileSync('migrations/20261008_insider_snapshots_v1.sql','utf8');
const MiB=1024*1024;
test('frozen actual-only capacity admits an unfinishable partial five-member set',()=>{
 assert.match(sql,/count_snap>=32 OR total_bytes\+octet_length\(raw_bytes\)>134217728/u);
 assert.match(sql,/r\.frozen_at IS NOT NULL AND m\.dataset=p_dataset/u);
 let actual=112*MiB;let count=10;let resolved=0;
 const admit=bytes=>{if(count>=32||actual+bytes>128*MiB)throw Error('capacity');actual+=bytes;count++;resolved++;};
 admit(12*MiB);assert.equal(actual,124*MiB);assert.throws(()=>admit(12*MiB),/capacity/);
 assert.equal(resolved,1);assert.equal(resolved===5,false,'read/commit frozen binding is unavailable');
});
test('transient free-space check alone loses reservation across another request',()=>{
 let actual=60*MiB;const promised=5*12*MiB;assert.ok(actual+promised<=128*MiB);
 // No durable charge: a competing admission can consume the same headroom.
 actual+=12*MiB;assert.ok(actual+promised>128*MiB);
});

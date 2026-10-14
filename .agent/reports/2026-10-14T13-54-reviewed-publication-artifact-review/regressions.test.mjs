import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
const w=fs.readFileSync(process.cwd()+'/.github/workflows/reviewed-publication-tail-artifact.yml','utf8');
const block=fs.readFileSync('/tmp/reviewed-artifact-workflow-review-o14/inline-03-0.mjs','utf8');
const parser=block.slice(block.indexOf('assert.ok(Buffer.byteLength'),block.indexOf('const git ='));
test('R1 browser provisioning precedes the first canonical browser consumer',()=>{
 assert.ok(w.indexOf('npx playwright install')<w.indexOf('npm run test:source-led-opportunity-v3:product-correctness'),'The only browser install is after the canonical suite');
});
test('R2 canonical receipt rejects a 31-result stream claiming 155',()=>{
 const log='TAP version 13\n'+Array.from({length:31},(_,i)=>`ok ${i+1} - acceptance PCR-${String(i+1).padStart(3,'0')}\n`).join('')+'1..155\n# tests 155\n# pass 155\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
 assert.throws(()=>vm.runInNewContext(parser,{assert,Buffer,log},{timeout:1000}));
});

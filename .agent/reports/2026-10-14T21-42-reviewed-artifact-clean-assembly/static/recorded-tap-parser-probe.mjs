import assert from 'node:assert/strict';
import fs from 'node:fs';
const parse = log => {
assert.ok(Buffer.byteLength(log, 'utf8') <= 4 * 1024 * 1024);
const start = log.indexOf('TAP version 13\n');
assert.ok(start >= 0);
const tap = log.slice(start);
for (const [name, expected] of Object.entries({ tests: 155, pass: 155, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
  const rows = [...tap.matchAll(new RegExp('^# ' + name + ' (\\d+)$', 'gmu'))];
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0][1]), expected);
}
assert.match(tap, /^1\.\.155$/mu);
const pcr = [...tap.matchAll(/^ok \d+ - acceptance (PCR-\d{3})$/gmu)].map(m => m[1]);
assert.deepEqual(pcr, Array.from({ length: 31 }, (_, i) => 'PCR-' + String(i + 1).padStart(3, '0')));
return pcr;
};
const tap = fs.readFileSync('/tmp/stockinsider-pr380-product-verification-oct14/canonical155.tap','utf8');
assert.equal(parse(tap).length,31);
assert.throws(()=>parse(tap.replace('# skipped 0','# skipped 1')));
assert.throws(()=>parse(tap.replace('# cancelled 0','# cancelled 1')));
assert.throws(()=>parse(tap.replace('ok 2 - acceptance PCR-001','ok 2 - acceptance PCR-002')));
assert.throws(()=>parse(tap.replace('# tests 155','# tests 154')));
process.stdout.write('Recorded TAP parser: one positive and four negatives PASS; no canonical test rerun\n');

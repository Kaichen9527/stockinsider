/* Synthetic stdin only. No application imports, native admission or raw output. */
const fs=require('node:fs'),assert=require('node:assert/strict');
try{
 const {frozenOracle,sourceOnlyCompose}=require('./t18_metadata_semantics_composition.cjs');
 const oracle=frozenOracle(process.argv[2],process.argv[3]);
 const pairs=JSON.parse(fs.readFileSync(0,'utf8'));assert(Array.isArray(pairs));
 for(const {raw,reduced}of pairs){
  assert.deepEqual(oracle(raw),oracle(reduced));
  const source=sourceOnlyCompose(raw);assert.equal(source.status,'SOURCE_ONLY_COMPOSED');
  assert.deepEqual(oracle(source.metadata),oracle(reduced));
 }
 process.stdout.write(JSON.stringify({status:'FROZEN_RAW_REDUCED_EQUIVALENT',cases:pairs.length}));
}catch{process.stdout.write(JSON.stringify({status:'FROZEN_RAW_REDUCED_MISMATCH'}));process.exitCode=2;}

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {encodeInsiderArchiveV2,restoreInsiderArchiveV2,validateInsiderArchiveBindingV2,INSIDER_RAW_MAX_BYTES,INSIDER_ENCODED_MAX_BYTES} from './insider-completed-archive-codec-v2.ts';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function binding(raw:Buffer,encoded:Buffer,encoding:'identity'|'gzip'='gzip') {return {schema:'insider-raw-archive-codec-v2' as const,encoding,rawSha256:hash(raw),rawBytes:raw.length,artifactSha256:hash(encoded),artifactBytes:encoded.length};}
test('byte-identical raw, independent observed metadata excluded, identity and gzip roundtrip',async()=>{
 for(const raw of [Buffer.from('[ {"姓名":"測試😀", "x":1} ]\r\n'),randomBytes(1024),Buffer.from('[]'),Buffer.alloc(8192,32)]) {
  const saved=await encodeInsiderArchiveV2(raw);assert.deepEqual(await restoreInsiderArchiveV2(saved.bytes,saved.binding),raw);
  assert.deepEqual(Object.keys(saved.binding).sort(),['artifactBytes','artifactSha256','encoding','rawBytes','rawSha256','schema']);
 }
 assert.equal((await encodeInsiderArchiveV2(Buffer.alloc(8192,32))).binding.encoding,'gzip');
 assert.equal((await encodeInsiderArchiveV2(Buffer.from('[]'))).binding.encoding,'identity');
});
test('raw12MiB exact and +1, encoded bound exact and +1, strict manifest fields',async()=>{
 const raw=Buffer.alloc(INSIDER_RAW_MAX_BYTES,32),saved=await encodeInsiderArchiveV2(raw);assert.deepEqual(await restoreInsiderArchiveV2(saved.bytes,saved.binding),raw);
 await assert.rejects(()=>encodeInsiderArchiveV2(Buffer.alloc(INSIDER_RAW_MAX_BYTES+1)),/raw_bound/);
 const b={...saved.binding,artifactBytes:INSIDER_ENCODED_MAX_BYTES};assert.doesNotThrow(()=>validateInsiderArchiveBindingV2(b));assert.throws(()=>validateInsiderArchiveBindingV2({...b,artifactBytes:INSIDER_ENCODED_MAX_BYTES+1}),/binding/);
 for(const patch of [{path:'/tmp/other'},{rawBytes:NaN},{encoding:'zip'},{rawSha256:'A'.repeat(64)}])assert.throws(()=>validateInsiderArchiveBindingV2({...saved.binding,...patch}),/binding/);
});
test('actual single-member gzip accepted; concatenation, trailing, header, checksum, truncation refuse even with matching encoded hash',async()=>{
 const raw=Buffer.from('source raw '.repeat(100)),good=gzipSync(raw);assert.deepEqual(await restoreInsiderArchiveV2(good,binding(raw,good)),raw);
 const badHeader=Buffer.from(good);badHeader[3]=8;
 const badCrc=Buffer.from(good);badCrc[badCrc.length-8]^=1;
 const badSize=Buffer.from(good);badSize[badSize.length-4]^=1;
 for(const bytes of [Buffer.concat([good,gzipSync(raw)]),Buffer.concat([good,Buffer.from([0])]),good.subarray(0,-1),badHeader,badCrc,badSize,Buffer.from('invalid gzip')])await assert.rejects(()=>restoreInsiderArchiveV2(bytes,binding(raw,bytes)),/gzip|raw_identity/);
});
test('declared size, hash tampering and bounded decompression bomb refuse',async()=>{
 const raw=Buffer.alloc(4096,65),saved=await encodeInsiderArchiveV2(raw);
 await assert.rejects(()=>restoreInsiderArchiveV2(saved.bytes,{...saved.binding,rawSha256:'0'.repeat(64)}),/raw_identity/);
 await assert.rejects(()=>restoreInsiderArchiveV2(saved.bytes,{...saved.binding,artifactSha256:'0'.repeat(64)}),/artifact_identity/);
 await assert.rejects(()=>restoreInsiderArchiveV2(saved.bytes,{...saved.binding,rawBytes:2}),/gzip/);
 const bombRaw=Buffer.alloc(INSIDER_RAW_MAX_BYTES+1,32),bomb=gzipSync(bombRaw);
 await assert.rejects(()=>restoreInsiderArchiveV2(bomb,{...binding(bombRaw,bomb),rawBytes:INSIDER_RAW_MAX_BYTES}),/gzip/);
 const corrupt=Buffer.from(saved.bytes);corrupt[10]^=1;await assert.rejects(()=>restoreInsiderArchiveV2(corrupt,saved.binding),/artifact_identity/);
});

test('actual valid gzip at encoded maximum with empty DEFLATE blocks restores; +1 envelope rejects',async()=>{
 let raw:Buffer=Buffer.alloc(0),good:Buffer=Buffer.alloc(0);
 for(let n=2;n<100;n++){raw=Buffer.from(Array.from({length:n},(_,i)=>i));good=gzipSync(raw);if((INSIDER_ENCODED_MAX_BYTES-good.length)%5===0)break;}
 const extra=INSIDER_ENCODED_MAX_BYTES-good.length;assert.equal(extra%5,0);
 const blocks=Buffer.alloc(extra);for(let i=0;i<extra;i+=5){blocks[i+3]=255;blocks[i+4]=255;}
 const exact=Buffer.concat([good.subarray(0,10),blocks,good.subarray(10)]);assert.equal(exact.length,INSIDER_ENCODED_MAX_BYTES);assert.deepEqual(await restoreInsiderArchiveV2(exact,binding(raw,exact)),raw);
 const over=Buffer.concat([exact,Buffer.from([0])]);await assert.rejects(()=>restoreInsiderArchiveV2(over,binding(raw,over)),/binding/);
});

test('stream abort/check failure rejects after close, caller mutation cannot change captured bytes',async()=>{
 const raw=Buffer.alloc(INSIDER_RAW_MAX_BYTES,65),saved=await encodeInsiderArchiveV2(raw);
 const controller=new AbortController();let checkpoints=0;
 await assert.rejects(restoreInsiderArchiveV2(saved.bytes,saved.binding,{signal:controller.signal,check(){if(++checkpoints===3)controller.abort();}}),/aborted/);
 checkpoints=0;
 await assert.rejects(restoreInsiderArchiveV2(saved.bytes,saved.binding,{check(){if(++checkpoints===3)throw Error('controlled_deadline');}}),/controlled_deadline/);
 const input=Buffer.from(saved.bytes),pending=restoreInsiderArchiveV2(input,saved.binding);input.fill(0);assert.deepEqual(await pending,raw);
 const truncated=saved.bytes.subarray(0,Math.floor(saved.bytes.length/2));
 await assert.rejects(restoreInsiderArchiveV2(truncated,binding(raw,truncated)));
});

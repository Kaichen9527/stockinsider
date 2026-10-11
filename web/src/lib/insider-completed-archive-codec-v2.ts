import {createHash} from 'node:crypto';
import {gzipSync,createInflateRaw} from 'node:zlib';

export const INSIDER_RAW_MAX_BYTES=12*1024*1024;
export const INSIDER_ENCODED_MAX_BYTES=INSIDER_RAW_MAX_BYTES+128*1024;
export type InsiderArchiveBindingV2={schema:'insider-raw-archive-codec-v2';encoding:'identity'|'gzip';rawSha256:string;rawBytes:number;artifactSha256:string;artifactBytes:number};
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const fail=(code:string):never=>{throw Error(`insider_archive_${code}`);};
export function validateInsiderArchiveBindingV2(value:unknown):InsiderArchiveBindingV2 {
 if(!value||typeof value!=='object'||Array.isArray(value))return fail('binding');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='artifactBytes,artifactSha256,encoding,rawBytes,rawSha256,schema'
  ||v.schema!=='insider-raw-archive-codec-v2'||typeof v.encoding!=='string'||!['identity','gzip'].includes(v.encoding)
  ||typeof v.rawSha256!=='string'||!/^[a-f0-9]{64}$/u.test(v.rawSha256)
  ||typeof v.artifactSha256!=='string'||!/^[a-f0-9]{64}$/u.test(v.artifactSha256)
  ||!Number.isSafeInteger(v.rawBytes)||Number(v.rawBytes)<2||Number(v.rawBytes)>INSIDER_RAW_MAX_BYTES
  ||!Number.isSafeInteger(v.artifactBytes)||Number(v.artifactBytes)<2||Number(v.artifactBytes)>INSIDER_ENCODED_MAX_BYTES)return fail('binding');
 return {...v} as InsiderArchiveBindingV2;
}
// RFC1952 trailer CRC, separate from the authoritative SHA256 raw identity.
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes:Buffer){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
type DecodeOptions={signal?:AbortSignal;check?:()=>void};
/** Pure bytes only. The binding is not a DB, storage durability or eviction receipt.
 * Decode output is streamed into exactly the declared bounded allocation. The
 * input copy prevents caller mutation while asynchronous zlib work is pending.
 */
export async function restoreInsiderArchiveV2(input:Buffer,value:unknown,options:DecodeOptions={}):Promise<Buffer> {
 const b=validateInsiderArchiveBindingV2(value);
 const deadline=performance.now()+30000;
 const check=()=>{if(options.signal?.aborted)fail('aborted');if(performance.now()>=deadline)fail('deadline');options.check?.();};
 check();if(!Buffer.isBuffer(input)||input.length!==b.artifactBytes)return fail('artifact_identity');
 const encoded=Buffer.from(input);let raw:Buffer|undefined;
 try {
  if(hash(encoded)!==b.artifactSha256)return fail('artifact_identity');
  if(b.encoding==='identity')raw=Buffer.from(encoded);
  else {
   // Closed single member: no optional flags/fields, zero mtime. OS/XFL are
   // informational only. Verify the consumed DEFLATE bytes and exact trailer.
   if(encoded.length<20||encoded[0]!==0x1f||encoded[1]!==0x8b||encoded[2]!==8||encoded[3]!==0||encoded.readUInt32LE(4)!==0)return fail('gzip_header');
   raw=Buffer.alloc(b.rawBytes);const output=raw;
   await new Promise<void>((resolve,reject)=>{
    const stream=createInflateRaw({chunkSize:16384});let offset=0;let failed:Error|undefined;let ended=false;
    const stop=(error:unknown)=>{failed??=error instanceof Error?error:Error('insider_archive_gzip_decode');stream.destroy(failed);};
    const abort=()=>stop(Error('insider_archive_aborted'));
    const timer=setTimeout(()=>stop(Error('insider_archive_deadline')),30000);
    options.signal?.addEventListener('abort',abort,{once:true});
    stream.on('data',(chunk:Buffer)=>{try{check();if(chunk.length>output.length-offset)fail('gzip_output_bound');chunk.copy(output,offset);offset+=chunk.length;}catch(error){stop(error);}});
    stream.on('error',error=>{failed??=error;});
    stream.on('end',()=>{try{check();const consumed=stream.bytesWritten;const trailer=10+consumed;
     if(!Number.isSafeInteger(consumed)||consumed<1||trailer+8!==encoded.length||offset!==b.rawBytes
      ||encoded.readUInt32LE(trailer)!==crc32(output)||encoded.readUInt32LE(trailer+4)!==offset)fail('gzip_member');
     ended=true;
    }catch(error){stop(error);}});
    // Settle only after native stream resources close, including abort/error.
    stream.on('close',()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);if(failed)reject(failed);else if(!ended)reject(Error('insider_archive_gzip_incomplete'));else resolve();});
    try{check();stream.end(encoded.subarray(10));}catch(error){stop(error);}
   });
  }
  check();if(raw.length!==b.rawBytes||hash(raw)!==b.rawSha256)return fail('raw_identity');
  return raw;
 }catch(error){raw?.fill(0);throw error;}finally{encoded.fill(0);}
}
export async function encodeInsiderArchiveV2(input:Buffer):Promise<{binding:InsiderArchiveBindingV2;bytes:Buffer}> {
 if(!Buffer.isBuffer(input)||input.length<2||input.length>INSIDER_RAW_MAX_BYTES)return fail('raw_bound');
 const raw=Buffer.from(input);try {
  const compressed=gzipSync(raw,{level:6});const encoding=compressed.length<raw.length?'gzip':'identity';
  const bytes=encoding==='gzip'?compressed:Buffer.from(raw);
  if(bytes.length>INSIDER_ENCODED_MAX_BYTES)return fail('encoded_bound');
  const binding:InsiderArchiveBindingV2={schema:'insider-raw-archive-codec-v2',encoding,rawSha256:hash(raw),rawBytes:raw.length,artifactSha256:hash(bytes),artifactBytes:bytes.length};
  const restored=await restoreInsiderArchiveV2(bytes,binding);try{if(!restored.equals(raw))return fail('raw_identity');}finally{restored.fill(0);}
  return {binding,bytes};
 }finally{raw.fill(0);}
}

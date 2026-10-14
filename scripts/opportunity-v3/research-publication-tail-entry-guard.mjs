import fs from 'node:fs';import {createHash}from 'node:crypto';
import {readTailNamespace}from './research-publication-tail-entry-namespace.mjs';
import {readResearchPublicationCatalog,fingerprintResearchPublicationCatalog}from './research-publication-catalog.mjs';
import {TAIL_ORDERED_SHA256}from './research-publication-tail-extraction.mjs';
export const POST50_BASELINE_SHA256='63677c0b92f9778f316dd5e7f68a8dd93f9d78fe2c013d7272417c1806ee33e4';
export const canonicalTailMetadata=v=>JSON.stringify(v,(_k,x)=>x&&!Array.isArray(x)&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b,'en'))):x);
export const tailMetadataSha=v=>createHash('sha256').update(canonicalTailMetadata(v)).digest('hex');
const bytes=fs.readFileSync(new URL('./research-publication-tail-post50-baseline.json',import.meta.url));
if(bytes.length>262144||createHash('sha256').update(bytes).digest('hex')!==POST50_BASELINE_SHA256)throw Error('publication_tail_post50_baseline_changed');
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
export const tailPost50Baseline=freeze(JSON.parse(bytes));
if(tailPost50Baseline.schema!=='captured-post-financial50-tail-predecessor-v1'||tailPost50Baseline.tailOrderedSha256!==TAIL_ORDERED_SHA256||tailPost50Baseline.productionApplyAuthorized!==false)throw Error('publication_tail_post50_baseline_invalid');
/** Read-only finite exact predecessor. Unknown objects/overloads and reachable privileges fail closed. */
export async function assertPublicationTailPredecessor(client){
 const namespace=await readTailNamespace(client);
 if(tailMetadataSha(namespace)!==tailPost50Baseline.namespaceSha256)throw Error('publication_tail_predecessor_namespace_mismatch');
 const catalog=await readResearchPublicationCatalog(client,tailPost50Baseline.scope);
 if(canonicalTailMetadata(fingerprintResearchPublicationCatalog(catalog))!==canonicalTailMetadata(tailPost50Baseline.fingerprints))throw Error('publication_tail_predecessor_catalog_mismatch');
 return Object.freeze({baselineSha256:POST50_BASELINE_SHA256,namespaceSha256:tailPost50Baseline.namespaceSha256});
}

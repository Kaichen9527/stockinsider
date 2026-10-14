import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {orderedHash} from './financial-history-install-guard.mjs';
export const TAIL_ORDERED_SHA256='edc46d48235d1542426c2ba729e24265d1722d757070a8ed5f97061ec843798e';
export const TAIL_DESCRIPTOR_SHA256='9410e8f3391c372439fc1f970214c69f1cfd9cb0a4cbebb324364bc493b349fe';
const sha=b=>createHash('sha256').update(b).digest('hex');
const raw=fs.readFileSync(new URL('./research-publication-tail-descriptor.json',import.meta.url));
if(sha(raw)!==TAIL_DESCRIPTOR_SHA256)throw Error('publication_tail_descriptor_changed');
export const publicationTailDescriptor=Object.freeze(JSON.parse(raw));
export function assertPublicationTailSelection(rows){
 const expected=publicationTailDescriptor.entries;
 if(!Array.isArray(rows)||rows.length!==26||new Set(rows.map(r=>r.relativePath)).size!==26)throw Error('publication_tail_selection_invalid');
 for(let i=0;i<26;i++){
  const r=rows[i],e=expected[i];
  if(r.relativePath!==e.relativePath||!Buffer.isBuffer(r.bytes)||r.bytes.length!==e.bytes||r.sha256!==e.sha256||sha(r.bytes)!==e.sha256)throw Error('publication_tail_source_mismatch');
 }
 if(orderedHash(rows)!==TAIL_ORDERED_SHA256)throw Error('publication_tail_order_mismatch');
 return rows;
}
/** Engineering descriptor only; no CLI, attestation, authority or production apply. */
export function loadPublicationTail(root){return assertPublicationTailSelection(publicationTailDescriptor.entries.map(e=>({relativePath:e.relativePath,bytes:fs.readFileSync(path.join(root,e.relativePath)),sha256:e.sha256})));}

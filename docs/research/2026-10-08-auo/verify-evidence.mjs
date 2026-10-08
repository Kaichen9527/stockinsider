// Read-only verification of exported analysis receipts and every row hash.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {researchCanonicalHash} from '../../../web/src/lib/research-agent-qualification.ts';
const root=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(await readFile(path.join(root,'hash-manifest.json'),'utf8'));let checks=0;
const materialHash=value=>{const {canonicalMaterialHash,...material}=value;assert.equal(researchCanonicalHash(material),canonicalMaterialHash);checks++;};
for(const entry of manifest.files){
 assert.ok(['dataset.json','source-ledger.json','calculation-results.json'].includes(entry.name));
 const raw=await readFile(path.join(root,entry.name));
 assert.equal(raw.length,entry.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),entry.sha256);checks++;
 const data=JSON.parse(raw);materialHash(data);
 if(entry.name==='dataset.json')for(const row of [...data.monthlyConsolidatedRevenue,...data.financialQuarterBridges])materialHash(row);
}
console.log(JSON.stringify({schemaVersion:'auo-readonly-evidence-hash-verification-v1',checks,pass:checks,fail:0,skip:0,scope:'3 file byte/hash checks,3 canonical material checks,24 month+8 quarter canonical row checks; not original PDF hash verification'}));

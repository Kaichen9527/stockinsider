// Analysis-only hashing, using the repository's existing canonical algorithm.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {researchCanonicalHash} from '../../../web/src/lib/research-agent-qualification.ts';
const root=path.dirname(fileURLToPath(import.meta.url));
const removeHash=value=>{const {canonicalMaterialHash,...material}=value;void canonicalMaterialHash;return material;};
const hashed=value=>{const material=removeHash(value);return {...material,canonicalMaterialHash:researchCanonicalHash(material)};};
const names=['dataset.json','source-ledger.json','calculation-results.json'];
const receipts=[];
for(const name of names){
 const input=JSON.parse(await readFile(path.join(root,name),'utf8'));
 if(name==='dataset.json'){
  input.monthlyConsolidatedRevenue=input.monthlyConsolidatedRevenue.map(hashed);
  input.financialQuarterBridges=input.financialQuarterBridges.map(hashed);
 }
 const result=hashed(input);const raw=JSON.stringify(result,null,2)+'\n';
 await writeFile(path.join(root,name),raw);
 receipts.push({name,bytes:Buffer.byteLength(raw),sha256:createHash('sha256').update(raw).digest('hex'),canonicalMaterialHash:result.canonicalMaterialHash});
}
const manifest={schemaVersion:'auo-analysis-hash-manifest-v1',algorithm:'existing researchCanonicalHash; each canonicalMaterialHash excludes its own field. Not a wire hash, protected attestation or imported research receipt.',files:receipts};
await writeFile(path.join(root,'hash-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));

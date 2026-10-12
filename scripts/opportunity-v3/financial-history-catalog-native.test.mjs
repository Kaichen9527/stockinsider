// Reuse the unchanged original fixture and its before/after lifecycle, not a new schema stub.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2);const mode=args[0];const artifacts=args[1];
if(!['red','green','capture'].includes(mode)||!artifacts||!path.isAbsolute(artifacts)||args.length!==2)throw Error('catalog_probe_arguments');
fs.mkdirSync(artifacts,{recursive:true,mode:0o700});
const original=fs.readFileSync(path.join(root,'scripts/opportunity-v3/migration-contract.test.mjs'),'utf8');
const generated=path.join(root,'.agent/tmp',`financial-catalog-${process.pid}.mjs`);fs.mkdirSync(path.dirname(generated),{recursive:true});
const patched=original.replace("'./atomic-migration-chain.mjs'",JSON.stringify(new URL('./atomic-migration-chain.mjs',import.meta.url).href));
if(patched===original)throw Error('fixture_import_not_found');
fs.writeFileSync(generated,patched+`\nimport {registerFinancialCatalogCases} from ${JSON.stringify(new URL('./financial-history-catalog-cases.mjs',import.meta.url).href)};\nregisterFinancialCatalogCases({psql,cluster:()=>cluster,financialHistorySql,mode:${JSON.stringify(mode)},artifacts:${JSON.stringify(artifacts)}});\n`);
fs.writeFileSync(path.join(artifacts,'fixture-input.json'),JSON.stringify({source:'scripts/opportunity-v3/migration-contract.test.mjs',sourceSha256:createHash('sha256').update(original).digest('hex'),generatedSha256:createHash('sha256').update(fs.readFileSync(generated)).digest('hex'),onlyFixtureImportRebased:true,profile:'unchanged synthetic legacy prerequisites + genuine original migration chain; not VPS full49'},null,2));
try {const r=spawnSync(process.execPath,['--experimental-strip-types','--test','--test-concurrency=1','--test-name-pattern=^financial catalog',generated],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:8*1024**2,env:process.env});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');if(r.error)process.stderr.write(`${r.error.code}: ${r.error.message}\n`);process.exitCode=r.status??1;}finally{fs.unlinkSync(generated);}

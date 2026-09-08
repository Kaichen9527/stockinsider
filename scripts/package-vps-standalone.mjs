import { cp, mkdir, mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Package build artifacts only. Never copy .env, Git objects or source databases.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='linux')throw new Error('VPS artifacts must be built and packaged on Linux; macOS native dependencies are not deployable');
const standalone=path.join(root,'web/.next/standalone');
await access(path.join(standalone,'server.js'));
const output=await mkdtemp(path.join(tmpdir(),'stockinsider-standalone-'));
await mkdir(path.join(output,'web'));
await cp(standalone,path.join(output,'web'),{recursive:true,filter:(source)=>!path.basename(source).startsWith('.env')});
await cp(path.join(root,'web/.next/static'),path.join(output,'web/.next/static'),{recursive:true});
await cp(path.join(root,'web/public'),path.join(output,'web/public'),{recursive:true});
for(const directory of ['scripts','deployment','config'])await cp(path.join(root,directory),path.join(output,directory),{recursive:true});
console.log(JSON.stringify({artifactDirectory:output,entrypoint:'web/server.js',workingDirectory:'web'}));

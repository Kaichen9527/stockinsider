#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath||inputPath===outputPath)throw new Error('usage: build-contabo-restore-list.mjs <pg_restore-list> <filtered-list>');
const legacyVaultFunctions=new Set([
  'read_threads_source_secret','refresh_threads_source_secret','refresh_threads_source_secret_v7',
  'revoke_threads_source_credential_v7','read_stockinsider_finmind_api_token_v6',
  'bootstrap_stockinsider_finmind_api_token_v6',
]);
let excluded=0;
const lines=readFileSync(inputPath,'utf8').split('\n').map((line)=>{
  if(!line||line.startsWith(';'))return line;
  const vaultNamespace=/\s(?:SCHEMA|TABLE|TABLE DATA|SEQUENCE|VIEW|FUNCTION|ACL|DEFAULT ACL|COMMENT)\s+(?:-\s+)?vault(?:\s|$)/u.test(line);
  const functionMatch=line.match(/\sFUNCTION\s+public\s+([a-zA-Z0-9_]+)(?:\s|\()/u);
  if(vaultNamespace||(functionMatch&&legacyVaultFunctions.has(functionMatch[1]))){excluded+=1;return `; CONTABO_EXCLUDED ${line}`;}
  return line;
});
writeFileSync(outputPath,lines.join('\n'),{encoding:'utf8',mode:0o600,flag:'wx'});
process.stdout.write(JSON.stringify({protocol:'stockinsider-contabo-restore-list-v1',excluded,output:outputPath})+'\n');

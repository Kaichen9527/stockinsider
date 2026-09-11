#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const legacyVaultFunctions=new Set([
  'read_threads_source_secret','refresh_threads_source_secret','refresh_threads_source_secret_v7',
  'revoke_threads_source_credential_v7','read_stockinsider_finmind_api_token_v6',
  'bootstrap_stockinsider_finmind_api_token_v6',
]);
const providerManagedEventTriggers=new Set([
  'issue_graphql_placeholder','issue_pg_cron_access','issue_pg_graphql_access',
  'issue_pg_net_access','pgrst_ddl_watch','pgrst_drop_watch',
]);

export function buildContaboRestoreList(contents){
  let excluded=0;
  const lines=contents.split('\n').map((line)=>{
    if(!line||line.startsWith(';'))return line;
    const vaultNamespace=/\s(?:SCHEMA|TABLE|TABLE DATA|SEQUENCE|VIEW|FUNCTION|ACL|DEFAULT ACL|COMMENT)\s+(?:-\s+)?vault(?:\s|$)/u.test(line);
    const vaultExtension=/\s(?:EXTENSION|COMMENT\s+-\s+EXTENSION)\s+(?:-\s+)?supabase_vault(?:\s|$)/u.test(line);
    const bootstrapOwnedSchema=/\sSCHEMA\s+-\s+extensions(?:\s|$)/u.test(line);
    const functionMatch=line.match(/\sFUNCTION\s+(?:public\s+)?([a-zA-Z0-9_]+)(?:\s|\()/u);
    const eventTriggerMatch=line.match(/\sEVENT TRIGGER\s+-\s+([a-zA-Z0-9_]+)(?:\s|$)/u);
    if(vaultNamespace||vaultExtension||bootstrapOwnedSchema
      ||(functionMatch&&legacyVaultFunctions.has(functionMatch[1]))
      ||(eventTriggerMatch&&providerManagedEventTriggers.has(eventTriggerMatch[1]))){
      excluded+=1;return `; CONTABO_EXCLUDED ${line}`;
    }
    return line;
  });
  return {contents:lines.join('\n'),excluded};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [inputPath,outputPath]=process.argv.slice(2);
  if(!inputPath||!outputPath||inputPath===outputPath)throw new Error('usage: build-contabo-restore-list.mjs <pg_restore-list> <filtered-list>');
  const result=buildContaboRestoreList(readFileSync(inputPath,'utf8'));
  writeFileSync(outputPath,result.contents,{encoding:'utf8',mode:0o600,flag:'wx'});
  process.stdout.write(JSON.stringify({protocol:'stockinsider-contabo-restore-list-v1',excluded:result.excluded,output:outputPath})+'\n');
}

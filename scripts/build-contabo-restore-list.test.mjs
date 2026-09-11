import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('restore list excludes replaced Vault and provider-managed bootstrap objects',()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'contabo-restore-list-'));
  try{
    const input=path.join(directory,'input.list'),output=path.join(directory,'output.list');
    writeFileSync(input,[
      '1; 2615 10 SCHEMA - public postgres','2; 2615 11 SCHEMA - vault supabase_admin',
      '3; 1259 12 TABLE vault secrets supabase_admin','4; 1255 13 FUNCTION public read_threads_source_secret() postgres',
      '5; 1255 14 FUNCTION public safe_public_rpc() postgres','6; 1259 15 TABLE public stocks postgres',
      '7; 3079 16 EXTENSION - supabase_vault','8; 0 0 COMMENT - EXTENSION supabase_vault',
      '9; 2615 17 SCHEMA - extensions postgres',
      '10; 0 0 ACL public FUNCTION read_threads_source_secret() postgres',
      '11; 3466 18 EVENT TRIGGER - pgrst_ddl_watch supabase_admin','',
    ].join('\n'));
    const result=spawnSync(process.execPath,[new URL('./build-contabo-restore-list.mjs',import.meta.url).pathname,input,output],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const filtered=readFileSync(output,'utf8');
    assert.match(filtered,/; CONTABO_EXCLUDED 2;/u); assert.match(filtered,/; CONTABO_EXCLUDED 3;/u);
    assert.match(filtered,/; CONTABO_EXCLUDED 4;/u); assert.match(filtered,/5; 1255 14 FUNCTION public safe_public_rpc/u);
    assert.match(filtered,/6; 1259 15 TABLE public stocks/u);
    assert.match(filtered,/; CONTABO_EXCLUDED 7;/u); assert.match(filtered,/; CONTABO_EXCLUDED 8;/u);
    assert.match(filtered,/; CONTABO_EXCLUDED 9;/u);
    assert.match(filtered,/; CONTABO_EXCLUDED 10;/u);
    assert.match(filtered,/; CONTABO_EXCLUDED 11;/u);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

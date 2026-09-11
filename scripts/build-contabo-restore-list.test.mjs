import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('restore list excludes only Vault namespace and named legacy secret functions',()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'contabo-restore-list-'));
  try{
    const input=path.join(directory,'input.list'),output=path.join(directory,'output.list');
    writeFileSync(input,[
      '1; 2615 10 SCHEMA - public postgres','2; 2615 11 SCHEMA - vault supabase_admin',
      '3; 1259 12 TABLE vault secrets supabase_admin','4; 1255 13 FUNCTION public read_threads_source_secret() postgres',
      '5; 1255 14 FUNCTION public safe_public_rpc() postgres','6; 1259 15 TABLE public stocks postgres','',
    ].join('\n'));
    const result=spawnSync(process.execPath,[new URL('./build-contabo-restore-list.mjs',import.meta.url).pathname,input,output],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const filtered=readFileSync(output,'utf8');
    assert.match(filtered,/; CONTABO_EXCLUDED 2;/u); assert.match(filtered,/; CONTABO_EXCLUDED 3;/u);
    assert.match(filtered,/; CONTABO_EXCLUDED 4;/u); assert.match(filtered,/5; 1255 14 FUNCTION public safe_public_rpc/u);
    assert.match(filtered,/6; 1259 15 TABLE public stocks/u);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

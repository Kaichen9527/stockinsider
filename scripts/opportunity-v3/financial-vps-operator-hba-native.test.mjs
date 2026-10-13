import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {assertVpsRuntimeHbaReject} from './vps-migration-peer.mjs';
test('native PostgreSQL distinguishes a reject file on disk from effective loaded HBA',async()=>{
  const {Client}=createRequire(import.meta.url)('pg');
  const bin=execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
  const directory=fs.mkdtempSync('/tmp/si-hba-probe-'),data=path.join(directory,'pg'),port=57000+process.pid%1000;
  let running=false,client;
  try {
    execFileSync(path.join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-instructions'],{stdio:'pipe'});
    execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(directory,'pg.log'),'-o',`-h '' -k ${directory} -p ${port}`,'-w','start'],{stdio:'pipe'});running=true;
    client=new Client({host:directory,port,user:'postgres',database:'postgres'});await client.connect();
    await client.query('CREATE DATABASE stockinsider');await client.query('CREATE ROLE stockinsider_runtime_v319 NOLOGIN');
    const createProbeClient=config=>new Client({...config,host:directory,port});
    const hbaFile=path.join(data,'pg_hba.conf');
    fs.writeFileSync(hbaFile,'local all postgres trust\nlocal all all reject\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n');
    // Reproduce the old timestamp predicate even though the changed file is NOT loaded.
    fs.utimesSync(hbaFile,new Date(0),new Date(0));
    const before=(await client.query("SELECT pg_conf_load_time()>=(pg_stat_file(current_setting('hba_file'))).modification AS old_timestamp_passes,(SELECT auth_method FROM pg_hba_file_rules WHERE rule_number=2) AS file_rule")).rows[0];
    assert.equal(before.old_timestamp_passes,true);assert.equal(before.file_rule,'reject');
    await assert.rejects(assertVpsRuntimeHbaReject(createProbeClient),/effective_hba_reject_required/u);
    await client.query('SELECT pg_reload_conf()');
    // Wait for a real SIGHUP load witness, rather than assuming reload is synchronous.
    let loaded=false;for(let i=0;i<100&&!loaded;i++) {
      try {await assertVpsRuntimeHbaReject(createProbeClient);loaded=true;}
      catch {await new Promise(resolve=>setTimeout(resolve,10));}
    }assert.equal(loaded,true);
    await client.query('ALTER ROLE stockinsider_runtime_v319 LOGIN');
    await assertVpsRuntimeHbaReject(createProbeClient);
  } finally {
    if(client)await client.end();
    if(running)execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe'});
    fs.rmSync(directory,{recursive:true,force:true});
  }
});

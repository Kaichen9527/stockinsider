import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {vpsPeerMigrationConnection,assertVpsPeerMigrationDatabase,assertVpsRuntimeHbaReject} from './vps-migration-peer.mjs';
import {parseArguments} from './apply-reviewed-migrations.mjs';

const argumentsFor=flags=>['--apply','--source-commit','a'.repeat(40),'--attestation-commit','b'.repeat(40),...flags];
test('VPS peer transport is explicit, fixed and does not accept credentials or PG environment overrides',()=>{
  const connection=vpsPeerMigrationConnection({platform:'linux',username:'postgres',environment:{}});
  assert.equal(typeof connection.password,'function');
  assert.throws(connection.password,/vps_peer_password_challenge_rejected/u);
  assert.deepEqual({...connection,password:undefined},
    {host:'/run/postgresql',port:5432,database:'stockinsider',user:'postgres',password:undefined,ssl:false,connectionTimeoutMillis:5000,
      options:'-c search_path=pg_catalog,public -c timezone=UTC'});
  for(const context of [{platform:'darwin',username:'postgres',environment:{}},
    {platform:'linux',username:'root',environment:{}},
    ...['PGHOST','PGPASSWORD','PGPASSFILE','PGOPTIONS'].map(key=>({platform:'linux',username:'postgres',environment:{[key]:'injected'}}))])
    assert.throws(()=>vpsPeerMigrationConnection(context),/operator_context_required/u);
  assert.throws(()=>parseArguments(argumentsFor(['--bootstrap-vps-runtime-role'])),/invalid_arguments/u);
  assert.throws(()=>parseArguments(argumentsFor(['--vps-peer','--bootstrap-vps-runtime-role'])),/invalid_arguments/u);
  assert.equal(parseArguments(argumentsFor(['--vps-peer','--research-agent-extension','--bootstrap-vps-runtime-role'])).bootstrapVpsRuntimeRole,true);
  assert.equal(parseArguments(argumentsFor([])).vpsPeer,false);
});
test('VPS database requires authenticated peer identity and an effective HBA reject, with stable profiles',async()=>{
  const valid={identity:true,peerIdentity:true,version:true,transport:true,hbaFile:'/etc/postgresql/17/stockinsider/pg_hba.conf',
    loadedAt:'2026-10-11 00:00:00+00',hbaSha256:'a'.repeat(64),hba:[
    ['local',['all'],['postgres'],null,null,'peer',null,null],
    ['local',['stockinsider'],['stockinsider'],null,null,'peer',null,null],
    ['local',['all'],['all'],null,null,'reject',null,null],
    ['host',['all'],['all'],'0.0.0.0','0.0.0.0','reject',null,null],
    ['host',['all'],['all'],'::','::','reject',null,null],
  ]};
  const client=value=>({query:async()=>({rows:[{profile:value}]})});
  const rejection={code:'28000',message:'pg_hba.conf rejects connection for host \"[local]\", user \"stockinsider_runtime_v319\", database \"stockinsider\", no encryption'};
  const factory=error=>({createProbeClient:config=>{assert.equal(config.user,'stockinsider_runtime_v319');
    assert.equal(typeof config.password,'function');assert.equal(config.connectionTimeoutMillis,5000);
    return {connect:async()=>{if(error)throw error;},end:async()=>{}};}});
  const options=factory(rejection);
  await assertVpsPeerMigrationDatabase(client(valid),options);
  for(const key of ['identity','peerIdentity','version','transport'])
    await assert.rejects(assertVpsPeerMigrationDatabase(client({...valid,[key]:false}),options),/database_profile_invalid/u);
  await assert.rejects(assertVpsPeerMigrationDatabase(client({...valid,hba:valid.hba.slice(0,2)}),options),/database_profile_invalid/u);
  const trust=structuredClone(valid);trust.hba[2][5]='trust';
  await assert.rejects(assertVpsPeerMigrationDatabase(client(trust),options),/database_profile_invalid/u);
  await assert.rejects(assertVpsPeerMigrationDatabase(client(null),options),/database_profile_invalid/u);
  for(const error of [null,{code:'28000',message:'role "stockinsider_runtime_v319" is not permitted to log in'},
    {code:'28000',message:rejection.message.replace('[local]','127.0.0.1')},
    {code:'28000',message:rejection.message.replace('stockinsider_runtime_v319','postgres')},
    {code:'28P01',message:rejection.message},new Error('timeout'),new Error('vps_peer_password_challenge_rejected')])
    await assert.rejects(assertVpsPeerMigrationDatabase(client(valid),factory(error)),/effective_hba_reject_required/u);
  let reads=0;
  await assert.rejects(assertVpsPeerMigrationDatabase({query:async()=>({rows:[{profile:++reads===1?valid:{...valid,hbaSha256:'b'.repeat(64)}}]})},options),/profile_changed_during_probe/u);
});

test('actual pg authentication handlers never consult pgpass or transmit credentials',async()=>{
  const require=createRequire(import.meta.url),{Client}=require('pg');
  const key=createRequire(require.resolve('pg')).resolve('pgpass'),previous=require.cache[key];let lookups=0;
  require.cache[key]={id:key,filename:key,loaded:true,exports:(_parameters,done)=>{lookups++;done('synthetic-probe-only');}};
  try {
    for(const [handler,message] of [['_handleAuthCleartextPassword',{}],
      ['_handleAuthMD5Password',{salt:Buffer.from([1,2,3,4])}],
      ['_handleAuthSASL',{mechanisms:['SCRAM-SHA-256']}]]) {
      const before=lookups,connection=new EventEmitter(),sent=[],errors=[];
      let resolveEvent;const event=new Promise(resolve=>{resolveEvent=resolve;});
      for(const method of ['password','sendSASLInitialResponseMessage','sendSCRAMClientFinalMessage'])
        connection[method]=()=>{sent.push(method);resolveEvent();};
      const onError=error=>{errors.push(error.message);resolveEvent();};connection.on('error',onError);
      const config=vpsPeerMigrationConnection({platform:'linux',username:'postgres',environment:{}});
      const client=new Client({...config,connection});client.on('error',onError);let timer;
      try {client[handler](message);await Promise.race([event,new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('probe_did_not_settle')),1000);})]);
        await new Promise(resolve=>setImmediate(resolve));
      } finally {clearTimeout(timer);}
      assert.equal(lookups-before,0,handler);assert.deepEqual(sent,[],handler);
      assert.deepEqual(errors,['vps_peer_password_challenge_rejected'],handler);
    }
  } finally {if(previous)require.cache[key]=previous;else delete require.cache[key];}
});

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

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
  assert.throws(()=>parseArguments(argumentsFor(['--bootstrap-vps-runtime-role'])),/invalid_arguments|flags_required/u);
  assert.throws(()=>parseArguments(argumentsFor(['--vps-peer','--bootstrap-vps-runtime-role'])),/invalid_arguments/u);
  assert.equal(parseArguments(argumentsFor(['--private-vps-peer-operator','--financial-existing-schema-profile','--bootstrap-vps-runtime-role'])).bootstrapVpsRuntimeRole,true);
  assert.equal(parseArguments(argumentsFor([])).privateVpsPeerOperator,undefined);
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


import {financialOperatorActionIdentity,assertOperatorPlan,assertOperatorFlags,assertOperatorReviewBinding} from './financial-vps-operator-binding.mjs';
import {ensureVpsRuntimeRole} from './financial-vps-operator-action.mjs';
import {MIGRATIONS,applyReviewedMigrationPlanToClient} from './apply-reviewed-migrations.mjs';
import {createHash} from 'node:crypto';
import {selectFinancialHistoryChain,FINANCIAL_TAIL,orderedHash} from './financial-history-install-guard.mjs';
import {OWNERSHIP_PRELUDE,makeFinancialExistingSchemaProfile} from './financial-existing-schema-profile.mjs';
const load=relativePath=>{const bytes=fs.readFileSync(relativePath);return {relativePath,bytes,sha256:createHash('sha256').update(bytes).digest('hex')};};
const migrations=selectFinancialHistoryChain(MIGRATIONS.map(load),load(FINANCIAL_TAIL),true);
const action=financialOperatorActionIdentity();
const plan={migrations,chainSha256:orderedHash(migrations),financialExistingSchemaProfile:makeFinancialExistingSchemaProfile(migrations,load(OWNERSHIP_PRELUDE)),operatorPrerequisite:action};
const operatorOptions={privateVpsPeerOperator:true,bootstrapVpsRuntimeRole:true,financialExistingSchemaProfile:true};
test('operator action closes source wrapper/peer/binding identity and separate profile review literal',()=>{
 assert.equal(action.sources.length,3);assertOperatorPlan(plan,operatorOptions);
 const literal=`Financial VPS operator prerequisite SHA256: ${action.actionSha256}`;
 assertOperatorReviewBinding(literal,action);
 for(const review of ['',literal+'\n'+literal,literal+'\n  '+literal,literal.replace(action.actionSha256,'0'.repeat(64))])assert.throws(()=>assertOperatorReviewBinding(review,action),/binding_missing/u);
 for(const field of ['action','profileSha256','actionSha256'])assert.throws(()=>assertOperatorPlan({...plan,operatorPrerequisite:{...action,[field]:'wrong'}},operatorOptions),/identity_mismatch/u);
 assert.throws(()=>assertOperatorPlan({...plan,operatorPrerequisite:undefined},operatorOptions),/identity_mismatch/u);
 assert.throws(()=>assertOperatorPlan(plan,{}),/flag_required/u);
 for(const value of [{privateVpsPeerOperator:true},{bootstrapVpsRuntimeRole:true},{...operatorOptions,financialExistingSchemaProfile:false},{...operatorOptions,financialHistoryExtension:true},{...operatorOptions,bootstrapVpsRuntimeRole:'true'}])assert.throws(()=>assertOperatorFlags(value),/flag/u);
 const args=argumentsFor(['--private-vps-peer-operator','--bootstrap-vps-runtime-role','--financial-existing-schema-profile']);
 assert.equal(parseArguments(args).bootstrapVpsRuntimeRole,true);
 assert.throws(()=>parseArguments([...args,'--private-vps-peer-operator']),/invalid_arguments/u);
});
const validRole={oid:'12345',name:'stockinsider_runtime_v319',login:false,inherit:false,super:false,createRole:false,createDb:false,replication:false,bypassRls:false,connectionLimit:-1,config:null,validUntil:null,passwordAbsent:true,memberships:[],objectAuthority:'a'.repeat(64)};
test('runtime role membership/password/config/high privilege drift rejects before ALTER; replay preserves exact attributes',async()=>{
 for(const change of [{oid:12345},{oid:'0'},{oid:'4294967296'},{memberships:[{member:1}]},{passwordAbsent:false},{config:[]},{validUntil:'infinity'},{super:true},{login:true},{connectionLimit:6}]) {
  const calls=[];const client={query:async sql=>{calls.push(sql);return {rows:[{profile:{...validRole,...change}}]};}};
  await assert.rejects(ensureVpsRuntimeRole(client),/profile_unknown/u);assert.equal(calls.some(x=>x.startsWith('ALTER ROLE')),false);
 }
 const calls=[];const replay={...validRole,login:true,connectionLimit:6};const client={query:async sql=>{calls.push(sql);return {rows:[{profile:replay}]};}};
 assert.equal((await ensureVpsRuntimeRole(client)).noOpReplay,true);assert.equal(calls.some(x=>x.startsWith('ALTER ROLE')),false);
});
test('successor and exact action identity checks precede any operator/prelude mutation; error rolls back',async()=>{
 for(const drift of [true,false]) {
 const calls=[];let actions=0;
 const client={query:async sql=>{calls.push(sql);if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};if(sql.includes(' AS observations'))return {rows:[{observations:false,wrapper:false,reader:false,residue:false,unknown_successor:drift}]};return {rows:[]};},end:async()=>{}};
 await assert.rejects(applyReviewedMigrationPlanToClient(client,drift?plan:{...plan,operatorPrerequisite:{...action,actionSha256:'0'.repeat(64)}},operatorOptions,{operatorPrerequisiteExecutor:async()=>{actions++;throw Error('should_not_reach');}}),/unknown_research|identity_mismatch/u);
 assert.equal(actions,0);assert.ok(calls.includes('ROLLBACK'));assert.equal(calls.some(x=>x.includes('DO $ownership_bridge$')),false);
 }
});

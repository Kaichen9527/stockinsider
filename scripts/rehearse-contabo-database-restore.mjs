#!/usr/bin/env node
/** Restore an authenticated backup into a disposable Unix-socket-only cluster.
 * Plaintext archives, database rows, credentials, and SQL errors are never
 * written to the receipt or stdout. This does not authorize a cutover.
 */
import { createDecipheriv, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { chmod,lstat,mkdtemp,mkdir,open,readFile,rm,statfs,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContaboRestoreList } from './build-contabo-restore-list.mjs';

const MAGIC=Buffer.from('SI-BACKUP-1\n'),IV_BYTES=12,CONTEXT_BYTES=32,TAG_BYTES=16;
const HEADER_BYTES=MAGIC.length+IV_BYTES+CONTEXT_BYTES;
const PG_BIN='/opt/homebrew/bin',MAX_ARCHIVE_BYTES=8*1024**3,MAX_CAPTURE_BYTES=1024*1024;
const MIN_FREE_BYTES=12n*1024n**3n;
const SAFE_ENV={PATH:`${PG_BIN}:/usr/bin:/bin`,LANG:'C',LC_ALL:'C'};
let phase='arguments';

function parseArguments(argv){
  const values=new Map();
  for(let index=0;index<argv.length;index+=2){
    const name=argv[index],value=argv[index+1];
    if(!name?.startsWith('--')||!value)throw new Error('arguments_invalid');
    values.set(name.slice(2),value);
  }
  const manifestPath=values.get('manifest'),keyDirectory=values.get('key-directory');
  const receiptDirectory=values.get('receipt-directory');
  if(values.size!==3||![manifestPath,keyDirectory,receiptDirectory].every(path.isAbsolute)){
    throw new Error('usage: --manifest ABSOLUTE --key-directory ABSOLUTE --receipt-directory ABSOLUTE');
  }
  return {manifestPath,keyDirectory,receiptDirectory};
}

function classifyError(line){
  if(/extension .* is not available/u.test(line))return 'extension_unavailable';
  if(/role .* does not exist/u.test(line))return 'role_missing';
  if(/schema .* does not exist/u.test(line))return 'schema_missing';
  if(/function .* does not exist/u.test(line))return 'function_missing';
  if(/relation .* does not exist/u.test(line))return 'relation_missing';
  if(/permission denied/u.test(line))return 'permission_denied';
  return 'other_sql_error';
}

function missingObjectSignature(line){
  const match=line.match(/(?:extension|role|schema|function|relation) ["']?([A-Za-z0-9_.-]+)["']?/u);
  if(match)return match[1];
  const denied=line.match(/permission denied (?:for|to) ([A-Za-z0-9_. -]{1,80})/u);
  return denied?.[1]?.trim().replace(/\s+/gu,'_')||null;
}

async function run(program,args,{input,captureStdout=false,allowEarlyClose=false,timeoutMs=30*60*1000}={}){
  const executable=program==='du'?'/usr/bin/du':path.join(PG_BIN,program);
  const child=spawn(executable,args,{env:SAFE_ENV,stdio:['pipe','pipe','pipe']});
  // The write callback below owns EPIPE handling (pg_restore --list exits after
  // reading the TOC); keep the socket error from becoming an unhandled event.
  child.stdin.on('error',()=>{});
  let stdout=Buffer.alloc(0),stdoutBytes=0,pending='';const errors=new Map(),missingObjects=new Set();
  child.stdout.on('data',chunk=>{
    stdoutBytes+=chunk.length;
    if(captureStdout&&stdout.length<MAX_CAPTURE_BYTES){
      stdout=Buffer.concat([stdout,chunk.subarray(0,MAX_CAPTURE_BYTES-stdout.length)]);
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',chunk=>{
    pending=(pending+chunk).slice(-65536);
    const lines=pending.split('\n');pending=lines.pop()||'';
    for(const line of lines){
      if(!/\b(?:ERROR|FATAL):/u.test(line))continue;
      const category=classifyError(line);errors.set(category,(errors.get(category)||0)+1);
      const signature=missingObjectSignature(line);if(signature)missingObjects.add(signature);
    }
  });
  const terminal=new Promise(resolve=>{
    child.once('error',()=>resolve(-1));child.once('close',code=>resolve(code??-1));
  });
  const timer=setTimeout(()=>child.kill('SIGTERM'),timeoutMs);let inputError;
  try{
    if(input){
      try{await input(child.stdin);}catch(error){if(!(allowEarlyClose&&error?.code==='EPIPE'))inputError=error;}
    }else child.stdin.end();
    const exitCode=await terminal;
    // A failing reader closes stdin early; preserve its categorized terminal
    // result instead of replacing the actual SQL failure with a writer EPIPE.
    if(inputError&&!(inputError.code==='EPIPE'&&exitCode!==0))throw inputError;
    return {exitCode,stdout,stdoutTruncated:stdoutBytes>stdout.length,
      errors:Object.fromEntries(errors),missingObjects:[...missingObjects].sort()};
  }finally{clearTimeout(timer);if(child.exitCode===null)child.kill('SIGTERM');}
}

async function assertPrivateDirectory(directory){
  const info=await lstat(directory);
  if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o777)!==0o700){
    throw new Error('private_directory_required');
  }
}

async function loadPrivateKey(directory){
  await assertPrivateDirectory(directory);
  const file=await open(path.join(directory,'aes256-v1.key'),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const info=await file.stat();
    if(!info.isFile()||info.uid!==process.getuid()||(info.mode&0o777)!==0o600||info.nlink!==1||info.size!==32){
      throw new Error('backup_key_invalid');
    }
    return await file.readFile();
  }finally{await file.close();}
}

async function hashEncryptedFile(file,size){
  const digest=createHash('sha256');
  for await(const chunk of file.createReadStream({start:0,end:size-1,autoClose:false}))digest.update(chunk);
  return digest.digest('hex');
}

async function readEnvelopeMetadata(file,size,contextSha256){
  if(size<=HEADER_BYTES+TAG_BYTES)throw new Error('backup_envelope_truncated');
  const header=Buffer.alloc(HEADER_BYTES),tag=Buffer.alloc(TAG_BYTES);
  await file.read(header,0,header.length,0);await file.read(tag,0,tag.length,size-tag.length);
  if(!header.subarray(0,MAGIC.length).equals(MAGIC)
    ||header.subarray(MAGIC.length+IV_BYTES).toString('hex')!==contextSha256){
    throw new Error('backup_envelope_context_invalid');
  }
  return {header,tag};
}

function createArchiveDecipher(key,{header,tag}){
  const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(MAGIC.length,MAGIC.length+IV_BYTES));
  decipher.setAAD(header);decipher.setAuthTag(tag);return decipher;
}

async function authenticateArchive(file,size,key,envelope){
  const decipher=createArchiveDecipher(key,envelope),digest=createHash('sha256');let plaintextBytes=0;
  for await(const encrypted of file.createReadStream({start:HEADER_BYTES,end:size-TAG_BYTES-1,autoClose:false})){
    const plaintext=decipher.update(encrypted);plaintextBytes+=plaintext.length;
    if(plaintextBytes>MAX_ARCHIVE_BYTES)throw new Error('backup_size_limit_exceeded');
    digest.update(plaintext);plaintext.fill(0);
  }
  const final=decipher.final();plaintextBytes+=final.length;
  if(plaintextBytes===0||plaintextBytes>MAX_ARCHIVE_BYTES)throw new Error('backup_size_invalid');
  digest.update(final);final.fill(0);
  return {plaintextBytes,plaintextSha256:digest.digest('hex')};
}

async function streamArchiveTo(file,size,key,envelope,writable){
  const decipher=createArchiveDecipher(key,envelope);
  const write=chunk=>new Promise((resolve,reject)=>writable.write(chunk,error=>error?reject(error):resolve()));
  for await(const encrypted of file.createReadStream({start:HEADER_BYTES,end:size-TAG_BYTES-1,autoClose:false})){
    const plaintext=decipher.update(encrypted);
    try{if(plaintext.length)await write(plaintext);}finally{plaintext.fill(0);}
  }
  const final=decipher.final();
  try{if(final.length)await write(final);}finally{final.fill(0);}
  // Explicitly deliver EOF. stream.pipeline waits for the child socket's close
  // event, but pg_restore itself waits for EOF before opening its DB session.
  // Every write callback has completed, so closing the write side cannot drop
  // userspace-buffered bytes and immediately delivers EOF to pg_restore.
  writable.destroy();
}

async function streamArchivePathTo(archivePath,size,key,envelope,writable){
  const file=await open(archivePath,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{await streamArchiveTo(file,size,key,envelope,writable);}finally{await file.close().catch(()=>{});}
}

async function directoryBytes(directory){
  const result=await run('du',['-sk',directory],{captureStdout:true,timeoutMs:5*60*1000});
  if(result.exitCode!==0)throw new Error('directory_measurement_failed');
  const kib=Number(result.stdout.toString('utf8').trim().split(/\s+/u)[0]);
  if(!Number.isSafeInteger(kib))throw new Error('directory_measurement_invalid');
  return kib*1024;
}

async function main(){
  const {manifestPath,keyDirectory,receiptDirectory}=parseArguments(process.argv.slice(2));
  phase='preflight';
  await assertPrivateDirectory(receiptDirectory);
  const capacity=await statfs('/private/tmp',{bigint:true});
  if(capacity.bavail*capacity.bsize<MIN_FREE_BYTES)throw new Error('insufficient_rehearsal_capacity');
  const manifestReceipt=JSON.parse(await readFile(manifestPath,'utf8'));
  if(manifestReceipt.manifest?.schema!=='stockinsider-database-export-v1'
    ||manifestReceipt.manifest?.format!=='pg_dump_custom')throw new Error('manifest_invalid');
  const contextSha256=createHash('sha256').update(JSON.stringify(manifestReceipt.manifest)).digest('hex');
  if(contextSha256!==manifestReceipt.contextSha256
    ||!/^[A-Za-z0-9_-]+\.sib$/u.test(manifestReceipt.result?.filename||''))throw new Error('manifest_invalid');
  const archivePath=path.join(path.dirname(manifestPath),manifestReceipt.result.filename);
  let key,clusterDirectory,started=false,receiptPath;
  try{
    key=await loadPrivateKey(keyDirectory);
    phase='authentication';
    const authenticationFile=await open(archivePath,constants.O_RDONLY|constants.O_NOFOLLOW);
    let initial,encryptedSha256,envelope,authenticated;
    try{
      initial=await authenticationFile.stat();
      if(!initial.isFile()||initial.uid!==process.getuid()||(initial.mode&0o777)!==0o600||initial.nlink!==1){
        throw new Error('encrypted_archive_permissions_invalid');
      }
      encryptedSha256=await hashEncryptedFile(authenticationFile,initial.size);
      envelope=await readEnvelopeMetadata(authenticationFile,initial.size,contextSha256);
      authenticated=await authenticateArchive(authenticationFile,initial.size,key,envelope);
    }finally{await authenticationFile.close().catch(()=>{});}
    if(authenticated.plaintextSha256!==manifestReceipt.result.plaintextSha256
      ||authenticated.plaintextBytes!==manifestReceipt.result.plaintextBytes)throw new Error('archive_digest_mismatch');
    clusterDirectory=await mkdtemp('/private/tmp/stockinsider-contabo-restore-');await chmod(clusterDirectory,0o700);
    const dataDirectory=path.join(clusterDirectory,'data'),socketDirectory=path.join(clusterDirectory,'socket');
    const filteredTocPath=path.join(clusterDirectory,'restore.filtered.toc');await mkdir(socketDirectory,{mode:0o700});
    phase='toc';
    const listResult=await run('pg_restore',['--list'],{captureStdout:true,allowEarlyClose:true,
      input:async stdin=>{
        try{await streamArchivePathTo(archivePath,initial.size,key,envelope,stdin);}
        catch(error){if(error?.code!=='EPIPE')throw error;}
      }});
    if(listResult.exitCode!==0||listResult.stdout.length===0||listResult.stdoutTruncated)throw new Error('archive_toc_failed');
    const filtered=buildContaboRestoreList(listResult.stdout.toString('utf8'));
    await writeFile(filteredTocPath,filtered.contents,{flag:'wx',mode:0o600});
    const tocEntries=filtered.contents.split('\n').filter(line=>line&&!line.startsWith(';')).length;
    phase='initdb';
    const init=await run('initdb',['-D',dataDirectory,'-U','stockinsider_rehearsal','--auth-local=trust',
      '--auth-host=reject','--encoding=UTF8','--no-locale']);if(init.exitCode!==0)throw new Error('initdb_failed');
    const start=await run('pg_ctl',['-D',dataDirectory,'-l',path.join(clusterDirectory,'postgres.log'),'-o',
      `-k ${socketDirectory} -c listen_addresses='' -c unix_socket_permissions=0700 -c log_statement=none -c log_min_error_statement=panic`,'-w','start']);
    if(start.exitCode!==0)throw new Error('postgres_start_failed');started=true;
    const createdb=await run('createdb',['--host',socketDirectory,'--username=stockinsider_rehearsal','stockinsider_rehearsal']);
    if(createdb.exitCode!==0)throw new Error('database_create_failed');
    const connection=['--host',socketDirectory,'--username=stockinsider_rehearsal','--dbname=stockinsider_rehearsal'];
    const bootstrap=await run('psql',[...connection,'--no-psqlrc','--set=ON_ERROR_STOP=1','--file',
      fileURLToPath(new URL('../deployment/vps/bootstrap-stockinsider-postgres.sql',import.meta.url))]);
    if(bootstrap.exitCode!==0)throw new Error('portable_bootstrap_failed');
    phase='restore';
    const restore=await run('pg_restore',[...connection,'--use-list',filteredTocPath,'--exit-on-error'],{
      input:stdin=>streamArchivePathTo(archivePath,initial.size,key,envelope,stdin),timeoutMs:60*60*1000});
    if(restore.exitCode!==0){const error=new Error('archive_restore_failed');error.restore={exitCode:restore.exitCode,errors:restore.errors,missingObjects:restore.missingObjects};throw error;}
    phase='migration';
    const migrate=await run('psql',[...connection,'--no-psqlrc','--set=ON_ERROR_STOP=1','--file',
      fileURLToPath(new URL('../migrations/20260911_contabo_data_plane_v1.sql',import.meta.url))]);
    if(migrate.exitCode!==0){const error=new Error('portable_migration_failed');error.restore={exitCode:migrate.exitCode,errors:migrate.errors};throw error;}
    const verificationSql=`SELECT json_build_object(
      'postgresVersion',current_setting('server_version'),
      'databaseBytes',pg_database_size(current_database()),
      'schemaCount',(SELECT count(*) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema'),
      'publicTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')),
      'publicFunctions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
      'userTriggers',(SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal),
      'rlsTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relrowsecurity AND n.nspname='public'),
      'policies',(SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
      'portableRoles',(SELECT count(*) FROM pg_roles WHERE rolname=ANY(ARRAY['anon','authenticated','service_role','authenticator','opportunity_v3_rpc_owner','legacy_correctness_rpc_owner','postgres','supabase_admin','supabase_auth_admin','supabase_realtime_admin','supabase_storage_admin','pgbouncer','dashboard_user','stockinsider_runtime_v319'])),
      'loginCompatibilityRoles',(SELECT count(*) FROM pg_roles WHERE rolcanlogin AND rolname=ANY(ARRAY['anon','authenticated','service_role','authenticator','opportunity_v3_rpc_owner','legacy_correctness_rpc_owner','postgres','supabase_admin','supabase_auth_admin','supabase_realtime_admin','supabase_storage_admin','pgbouncer','dashboard_user','stockinsider_runtime_v319'])),
      'serviceRoleBypassesRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'),
      'serviceRoleTableGrants',(SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='service_role' AND table_schema='public'),
      'authenticatedTableGrants',(SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='authenticated' AND table_schema='public'),
      'anonTableGrants',(SELECT count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public'),
      'serviceRoleRoutineGrants',(SELECT count(*) FROM information_schema.routine_privileges WHERE grantee='service_role' AND routine_schema='public'),
      'dataPlaneTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY(ARRAY['stockinsider_data_plane_settings_v1','stockinsider_backend_identities_v1','provider_credentials_encrypted_v1','private_artifact_receipts_v1'])),
      'dataPlaneFunctions',(SELECT count(DISTINCT p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(ARRAY['assert_stockinsider_backend_request_v1','read_provider_credential_envelope_v1','read_provider_credential_state_v1','replace_provider_credential_cas_v1','revoke_provider_credential_cas_v1','register_private_artifact_receipt_v1'])),
      'writerFenceFunctions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='enforce_production_writer_fence'),
      'writerFenceTriggers',(SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE NOT t.tgisinternal AND n.nspname='public' AND p.proname='enforce_production_writer_fence'),
      'identityFenceEnabled',(SELECT identity_fence_enabled FROM public.stockinsider_data_plane_settings_v1 WHERE singleton),
      'vaultSchemaPresent',(to_regnamespace('vault') IS NOT NULL),
      'vaultExtensionPresent',EXISTS(SELECT 1 FROM pg_extension WHERE extname='supabase_vault'),
      'owners',(SELECT COALESCE(json_object_agg(owner_name,object_count),'{}'::json) FROM (SELECT pg_get_userbyid(relowner) owner_name,count(*) object_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' GROUP BY 1 ORDER BY 1) owners));`;
    phase='verification';
    const verify=await run('psql',[...connection,'--no-psqlrc','--tuples-only','--no-align','--set=ON_ERROR_STOP=1','--command',verificationSql],{captureStdout:true});
    if(verify.exitCode!==0)throw new Error('restore_verification_query_failed');
    const checks=JSON.parse(verify.stdout.toString('utf8').trim());
    const restoreVerified=checks.portableRoles===14&&checks.loginCompatibilityRoles===0
      &&checks.serviceRoleBypassesRls===true&&checks.dataPlaneTables===4&&checks.dataPlaneFunctions===6
      &&checks.writerFenceFunctions===1&&checks.identityFenceEnabled===false
      &&checks.vaultSchemaPresent===false&&checks.vaultExtensionPresent===false
      &&checks.publicTables>0&&checks.publicFunctions>0&&checks.userTriggers>0&&checks.rlsTables>0&&checks.policies>0;
    if(!restoreVerified)throw new Error('portable_contract_verification_failed');
    const finalFile=await open(archivePath,constants.O_RDONLY|constants.O_NOFOLLOW);
    let final;
    try{final=await finalFile.stat();}finally{await finalFile.close();}
    if(final.dev!==initial.dev||final.ino!==initial.ino||final.size!==initial.size||final.mtimeMs!==initial.mtimeMs){
      throw new Error('encrypted_archive_changed_during_rehearsal');
    }
    const clusterBytes=await directoryBytes(clusterDirectory),timestamp=new Date().toISOString();
    const receipt={schema:'stockinsider-contabo-restore-rehearsal-v2',createdAt:timestamp,
      source:{backupId:manifestReceipt.manifest.id,project:manifestReceipt.manifest.project,
        serverVersion:manifestReceipt.manifest.serverVersion,encryptedBytes:initial.size,encryptedSha256,
        plaintextBytes:authenticated.plaintextBytes,plaintextSha256:authenticated.plaintextSha256,contextSha256},
      restore:{postgresVersion:checks.postgresVersion,unixSocketOnly:true,plaintextArchiveWritten:false,ownerAndAclReplay:true,
        tocEntries,excludedVaultEntries:filtered.excluded,tocSha256:createHash('sha256').update(listResult.stdout).digest('hex'),
        filteredTocSha256:createHash('sha256').update(filtered.contents).digest('hex'),
        databaseBytes:Number(checks.databaseBytes),clusterBytes,portableMigrationApplied:true},
      checks,restoreVerified:true,productionCutoverApproved:false,
      limitations:['provider_credentials_not_decrypted_or_exercised','document_restore_is_a_separate_recovery_set','independent_key_escrow_not_verified']};
    receiptPath=path.join(receiptDirectory,`contabo-restore-rehearsal-${timestamp.replace(/[:.]/gu,'-')}.receipt.json`);
    await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{flag:'wx',mode:0o600});
    console.log(JSON.stringify({restoreVerified:true,receiptPath,databaseBytes:receipt.restore.databaseBytes,
      clusterBytes,checks,excludedVaultEntries:filtered.excluded}));
  }finally{
    key?.fill(0);
    if(started&&clusterDirectory){
      const stopped=await run('pg_ctl',['-D',path.join(clusterDirectory,'data'),'-m','fast','-w','stop'],{timeoutMs:5*60*1000});
      if(stopped.exitCode!==0)throw new Error('rehearsal_shutdown_failed');
    }
    if(clusterDirectory)await rm(clusterDirectory,{recursive:true,force:false,maxRetries:2});
  }
  return receiptPath;
}

try{await main();}catch(error){
  console.error(JSON.stringify({error:error?.message||'contabo_restore_rehearsal_failed',phase,restore:error?.restore,restoreVerified:false}));
  process.exitCode=1;
}

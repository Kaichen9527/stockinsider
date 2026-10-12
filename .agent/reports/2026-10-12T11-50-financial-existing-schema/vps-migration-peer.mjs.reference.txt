import os from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
const {Client}=createRequire(import.meta.url)('pg');

function rejectPasswordChallenge() { throw new Error('vps_peer_password_challenge_rejected'); }
function fixedConnection() {
  return {host:'/run/postgresql',port:5432,database:'stockinsider',user:'postgres',
    password:rejectPasswordChallenge,ssl:false,connectionTimeoutMillis:5000,
    options:'-c search_path=pg_catalog,public -c timezone=UTC'};
}

export function vpsPeerMigrationConnection({platform=process.platform,username=os.userInfo().username,
  environment=process.env}={}) {
  if(platform!=='linux'||username!=='postgres'||Object.keys(environment).some(key=>key.startsWith('PG')))
    throw new Error('vps_peer_migration_operator_context_required');
  return fixedConnection();
}

const hba=[
  ['local',['all'],['postgres'],null,null,'peer',null,null],
  ['local',['stockinsider'],['stockinsider'],null,null,'peer',null,null],
  ['local',['all'],['all'],null,null,'reject',null,null],
  ['host',['all'],['all'],'0.0.0.0','0.0.0.0','reject',null,null],
  ['host',['all'],['all'],'::','::','reject',null,null],
];
async function databaseProfile(client) {
  return (await client.query(`SELECT jsonb_build_object(
    'identity',current_user='postgres' AND session_user='postgres' AND current_database()='stockinsider',
    'peerIdentity',system_user='peer:postgres',
    'version',current_setting('server_version_num')::integer BETWEEN 170000 AND 179999,
    'transport',current_setting('listen_addresses')='' AND current_setting('unix_socket_directories')='/run/postgresql'
      AND current_setting('port')='5432' AND inet_client_addr() IS NULL AND NOT pg_is_in_recovery(),
    'hbaFile',current_setting('hba_file'),'loadedAt',pg_conf_load_time()::text,
    'hbaSha256',encode(sha256(pg_read_binary_file(current_setting('hba_file'))),'hex'),
    'hba',(SELECT jsonb_agg(jsonb_build_array(type,database,user_name,address,netmask,auth_method,options,error)
      ORDER BY rule_number) FROM pg_hba_file_rules)) AS profile`)).rows?.[0]?.profile;
}
function assertProfile(value) {
  if(!value||value.identity!==true||value.peerIdentity!==true||value.version!==true||value.transport!==true
    ||typeof value.hbaFile!=='string'||!value.hbaFile.startsWith('/')
    ||typeof value.loadedAt!=='string'||!/^[a-f0-9]{64}$/u.test(value.hbaSha256??'')
    ||!isDeepStrictEqual(value.hba,hba))throw new Error('vps_peer_migration_database_profile_invalid');
}

// pg_hba_file_rules reads the file, not the loaded rules. Only a real rejected
// connection proves this role hits HBA reject BEFORE role-login/password checks.
// The injected factory exists solely for isolated tests; CLI callers use fixedConnection.
export async function assertVpsRuntimeHbaReject(createProbeClient=config=>new Client(config)) {
  const probe=createProbeClient({...fixedConnection(),user:'stockinsider_runtime_v319'});
  let rejected=false;
  try {
    await probe.connect();
  } catch(error) {
    rejected=error?.code==='28000'&&/^pg_hba\.conf rejects connection for host "\[local\]", user "stockinsider_runtime_v319", database "stockinsider"(?:, no encryption)?$/u.test(error.message);
  } finally {
    await probe.end();
  }
  if(!rejected)throw new Error('vps_peer_migration_effective_hba_reject_required');
}
export async function assertVpsPeerMigrationDatabase(client,{createProbeClient}={}) {
  const before=await databaseProfile(client);assertProfile(before);
  await assertVpsRuntimeHbaReject(createProbeClient);
  const after=await databaseProfile(client);assertProfile(after);
  if(!isDeepStrictEqual(before,after))throw new Error('vps_peer_migration_profile_changed_during_probe');
  return {identityVerified:true,privatePeerTransportVerified:true,hbaVerified:true,effectiveRuntimeRejectVerified:true};
}

async function roleSnapshot(client) {
  return (await client.query(`SELECT jsonb_build_object('oid',r.oid,'name',r.rolname,
    'login',r.rolcanlogin,'inherit',r.rolinherit,'super',r.rolsuper,'createRole',r.rolcreaterole,
    'createDb',r.rolcreatedb,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,
    'connectionLimit',r.rolconnlimit,'config',r.rolconfig,'validUntil',r.rolvaliduntil,
    'passwordAbsent',(SELECT rolpassword IS NULL FROM pg_authid WHERE oid=r.oid),
    'memberships',(SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor),'[]'::jsonb)
      FROM pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid),
    'objectAuthority',(SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(x ORDER BY x::text),'[]'::jsonb)::text,'UTF8')),'hex')
      FROM (SELECT jsonb_build_array('relation',c.oid,c.relowner,c.relacl) x FROM pg_class c
          WHERE c.relowner=r.oid OR EXISTS(SELECT FROM aclexplode(c.relacl) a WHERE a.grantee=r.oid OR a.grantor=r.oid)
        UNION ALL SELECT jsonb_build_array('routine',p.oid,p.proowner,p.proacl) FROM pg_proc p
          WHERE p.proowner=r.oid OR EXISTS(SELECT FROM aclexplode(p.proacl) a WHERE a.grantee=r.oid OR a.grantor=r.oid)
        UNION ALL SELECT jsonb_build_array('schema',n.oid,n.nspowner,n.nspacl) FROM pg_namespace n
          WHERE n.nspowner=r.oid OR EXISTS(SELECT FROM aclexplode(n.nspacl) a WHERE a.grantee=r.oid OR a.grantor=r.oid)
        UNION ALL SELECT jsonb_build_array('column',a.attrelid,a.attnum,a.attacl) FROM pg_attribute a
          WHERE EXISTS(SELECT FROM aclexplode(a.attacl) v WHERE v.grantee=r.oid OR v.grantor=r.oid)) objects)
    ) AS profile FROM pg_roles r WHERE r.rolname='stockinsider_runtime_v319'`)).rows?.[0]?.profile;
}

// Separate, explicit operator action under the SAME attested plan/transaction.
// This is not a migration fallback or a grant of application/publication rights.
export async function bootstrapVpsRuntimeRole(client) {
  const before=await roleSnapshot(client);
  if(!before||before.login!==false||before.inherit!==false||before.super!==false
    ||before.createRole!==false||before.createDb!==false||before.replication!==false
    ||before.bypassRls!==false||before.connectionLimit!==-1||before.config!==null
    ||before.validUntil!==null||before.passwordAbsent!==true)
    throw new Error('vps_runtime_role_bootstrap_unknown_predecessor');
  await client.query('ALTER ROLE stockinsider_runtime_v319 LOGIN NOINHERIT CONNECTION LIMIT 6 PASSWORD NULL');
  const after=await roleSnapshot(client);
  if(!isDeepStrictEqual(after,{...before,login:true,connectionLimit:6}))
    throw new Error('vps_runtime_role_bootstrap_authority_changed');
  return {role:before.name,roleOid:before.oid,passwordAbsent:true,ownerAclAndMembershipUnchanged:true,
    login:true,connectionLimit:6};
}

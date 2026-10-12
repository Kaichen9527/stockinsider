import {isDeepStrictEqual} from 'node:util';
import {bootstrapVpsRuntimeRole,assertVpsPeerMigrationDatabase} from './vps-migration-peer.mjs';
export async function snapshotVpsRuntimeRole(client) {
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


function assertRuntimeProfile(value) {
 if(!value || value.name!=='stockinsider_runtime_v319' || value.inherit!==false || value.super!==false
  ||value.createRole!==false||value.createDb!==false||value.replication!==false||value.bypassRls!==false
  ||value.config!==null||value.validUntil!==null||value.passwordAbsent!==true
  ||!Array.isArray(value.memberships)||value.memberships.length!==0
  ||!(typeof value.oid==='string'&&/^[1-9][0-9]{0,9}$/u.test(value.oid)&&BigInt(value.oid)<=4294967295n)||! /^[a-f0-9]{64}$/u.test(value.objectAuthority??'')
  ||!((value.login===false&&value.connectionLimit===-1)||(value.login===true&&value.connectionLimit===6)))
  throw Error('financial_operator_runtime_profile_unknown');
}
export async function ensureVpsRuntimeRole(client) {
 const before=await snapshotVpsRuntimeRole(client);assertRuntimeProfile(before);
 let action;
 if(before.login===false) action=await bootstrapVpsRuntimeRole(client);
 else action={role:before.name,roleOid:before.oid,passwordAbsent:true,ownerAclAndMembershipUnchanged:true,login:true,connectionLimit:6};
 const after=await snapshotVpsRuntimeRole(client);assertRuntimeProfile(after);
 if(!isDeepStrictEqual(after,{...before,login:true,connectionLimit:6}))throw Error('financial_operator_runtime_authority_changed');
 return {...action,noOpReplay:before.login===true};
}
export async function executeFinancialVpsOperatorPrerequisite(client) {
 const transport=await assertVpsPeerMigrationDatabase(client);
 const role=await ensureVpsRuntimeRole(client);
 return {transport,role};
}

BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SELECT jsonb_build_object('observedAt',clock_timestamp(),'database',current_database(),'serverVersion',current_setting('server_version_num'),'observer',current_user,
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'inherit',r.rolinherit,'super',r.rolsuper,'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,'connectionLimit',r.rolconnlimit,'config',r.rolconfig,'validUntil',r.rolvaliduntil,
 'publicCreate',has_schema_privilege(r.oid,'public','CREATE'),'passwordAbsent',(SELECT rolpassword IS NULL FROM pg_authid WHERE oid=r.oid),
 'memberships',(SELECT COALESCE(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(m.roleid),'member',pg_get_userbyid(m.member),'grantor',pg_get_userbyid(m.grantor),'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) ORDER BY m.roleid,m.member),'[]'::jsonb) FROM pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid)) ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname IN ('stockinsider_runtime_v319','legacy_correctness_rpc_owner','opportunity_v3_rpc_owner')));
ROLLBACK;

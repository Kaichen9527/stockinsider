/** Original VM stdlib-only contracts. NO PG/grant/role/native execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SOURCE_NAMESPACE_PROFILE as profile,SOURCE_NAMESPACE_GRANT,SOURCE_SCOPE_SQL,deriveSourceNamespacePost,projectSourceNamespaceCatalog} from './vnext-source-namespace-candidate.mjs';
const target=profile.target,clone=value=>JSON.parse(JSON.stringify(value));
const fixture=()=>({roles:[{name:target,login:false,super:false,createDb:false,createRole:false,replication:false,bypassRls:false,config:null,membership:[]}],schemas:[{name:'auth',owner:'postgres',acl:[],effectiveAcl:[[target,false,false]]},{name:'public',owner:'pg_database_owner',acl:[['pg_database_owner','postgres','USAGE',false]],effectiveAcl:[['postgres',true,true],[target,false,false],['service_role',true,false]]}],tables:[{name:'synthetic',owner:target,acl:[],rls:true}],functions:[{signature:'synthetic()',definitionSha256:'original'}],types:[]});
const proposed=[['pg_database_owner','postgres','USAGE',false],['pg_database_owner',target,'USAGE',false]];
test('one usage bit/ACL only, all unrelated and unknown fields retained, original immutable',()=>{
 const before=fixture();before.futurePersistedField={keep:['unknown',null]};const snapshot=clone(before),after=projectSourceNamespaceCatalog(before,proposed);
 assert.deepEqual(before,snapshot);assert.notEqual(after,before);
 assert.deepEqual(after.schemas[1].effectiveAcl,[['postgres',true,true],[target,true,false],['service_role',true,false]]);
 const restored=clone(after);restored.schemas[1].acl=clone(before.schemas[1].acl);restored.schemas[1].effectiveAcl[1][1]=false;assert.deepEqual(restored,before);
});
test('create/grant option/other grantee/duplicate/removal/reorder cannot masquerade as usage',()=>{
 for(const bad of [proposed.slice(0,1),[...proposed,proposed[1]], [proposed[0],['pg_database_owner',target,'CREATE',false]], [proposed[0],['pg_database_owner',target,'USAGE',true]], [proposed[0],['postgres',target,'USAGE',false]], [proposed[0],['pg_database_owner','service_role','USAGE',false]], [proposed[1]]])assert.throws(()=>projectSourceNamespaceCatalog(fixture(),bad));
 const multiple=fixture();multiple.schemas[1].acl.push(['pg_database_owner','service_role','USAGE',false]);
 assert.throws(()=>projectSourceNamespaceCatalog(multiple,[multiple.schemas[1].acl[1],multiple.schemas[1].acl[0],proposed[1]]));
});
test('role privilege, memberships/config, wrong owner and already-present usage fail closed',()=>{
 const mutations=[x=>x.roles[0].login=true,x=>x.roles[0].super=true,x=>x.roles[0].createDb=true,x=>x.roles[0].createRole=true,x=>x.roles[0].replication=true,x=>x.roles[0].bypassRls=true,x=>x.roles[0].config=[],x=>x.roles[0].membership=[['other',target,'postgres',false,true,true]],x=>x.schemas[1].owner='postgres',x=>x.schemas[1].effectiveAcl[1][1]=true,x=>x.schemas[1].effectiveAcl[1][2]=true,x=>x.schemas[1].acl.push(proposed[1]),x=>x.roles=[]];
 for(const mutate of mutations){const before=fixture();mutate(before);assert.throws(()=>projectSourceNamespaceCatalog(before,proposed));}
});
test('pure projection is not actual predecessor permission, unknown scope/hash rejected',()=>{
 assert.throws(()=>deriveSourceNamespacePost({scope:{},namespace:{},catalog:fixture()},proposed),/vnext_source_namespace_scope/);
 assert.equal(profile.nativeVerified,false);assert.equal(profile.productionAuthorized,false);assert.equal(SOURCE_NAMESPACE_GRANT,'GRANT USAGE ON SCHEMA public TO research_source_fence_owner_v2');
});
test('current scope query exact ccc source; no workflow/entry import or mutation until independent review',()=>{
 const source=fs.readFileSync('scripts/vnext-source-namespace-candidate.mjs','utf8'),entry=fs.readFileSync('scripts/vnext-routine-http.test.mjs','utf8');
 assert.ok(entry.includes(JSON.stringify(SOURCE_SCOPE_SQL)));assert.equal(entry.includes("from './vnext-source-namespace-candidate.mjs'"),false);
 const apply=source.slice(source.indexOf('export async function applySourceNamespaceEngineeringCandidate'));
 assert.ok(apply.indexOf('deriveSourceNamespacePost')<apply.indexOf('client.query(SOURCE_NAMESPACE_GRANT)'));
 assert.ok(apply.indexOf('same(after.catalog,expected.catalog)')<apply.indexOf("client.query('COMMIT')"));
 for(const preserved of ['same(after.namespace,before.namespace)','same(rawAfter,rawBefore)',"client.query('ROLLBACK')",'pg_advisory_unlock'])assert.ok(apply.includes(preserved));
 const locks=['610091002','2409,6002','64221022'].map(value=>apply.indexOf(value));assert.ok(locks[0]<locks[1]&&locks[1]<locks[2]);
 assert.equal(/CREATE ROLE|ALTER ROLE|BYPASSRLS|GRANT CREATE|GRANT ALL|UPDATE pg_|REVOKE /u.test(source),false);
});

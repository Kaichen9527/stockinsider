import assert from 'node:assert/strict';
import test from 'node:test';
import {FINANCIAL_HISTORY_EXPECTED_CATALOG,assertFinancialHistoryCatalog,normalizeFiniteImmutableAcl} from './financial-history-install-guard.mjs';
const base=()=>structuredClone(FINANCIAL_HISTORY_EXPECTED_CATALOG);
const immutable=c=>c.functions.find(f=>f.name==='legacy_correctness_immutable_v3_11');
const five=()=>{const c=base();const f=immutable(c);f.acl.push(...['anon','authenticated','service_role'].map(grantee=>({grantee,grantor:f.owner,privilege:'EXECUTE',grantable:false})));return c;};
test('only complete immutable two/five ACL sets normalize; input unchanged and row order irrelevant',()=>{
 for(const c of [base(),five()]){const copy=structuredClone(c);assertFinancialHistoryCatalog(c);assert.deepEqual(c,copy);assert.deepEqual(normalizeFiniteImmutableAcl(c),base());}
 const reversed=five();immutable(reversed).acl.reverse();assertFinancialHistoryCatalog(reversed);
});
test('immutable unknown/duplicate/grantor/grantable/missing-PUBLIC/partial3-4 ACL shapes fail closed',()=>{
 const changes=[f=>f.acl.push({grantee:'postgres',grantor:f.owner,privilege:'EXECUTE',grantable:false}),f=>f.acl.push({...f.acl[0]}),f=>f.acl[0].grantor='postgres',f=>f.acl[0].grantable=true,f=>f.acl=f.acl.filter(a=>a.grantee!=='PUBLIC'),f=>f.acl=f.acl.slice(0,3),f=>f.acl=f.acl.slice(0,4),f=>f.acl[0].privilege='SELECT',f=>f.acl[0].unknown=true];
 for(const change of changes){const c=five();change(immutable(c));assert.throws(()=>assertFinancialHistoryCatalog(c),/postcondition_failed/u);}
});
test('finite immutable ACL never relaxes body/owner/SECDEF/config/signature/other functions/table columns',()=>{
 const changes=[c=>immutable(c).bodySha256='0'.repeat(64),c=>immutable(c).owner='postgres',c=>immutable(c).securityDefiner=true,c=>immutable(c).config=['search_path=public'],c=>immutable(c).arguments='uuid',c=>immutable(c).result='jsonb',c=>c.functions[0].acl[0].grantor='postgres',c=>c.observation.rls=false,c=>c.observation.columns[0].columnAcl=[{grantee:'anon',privilege:'SELECT',grantable:false}],c=>c.indexes[0].valid=false];
 for(const change of changes){const c=five();change(c);assert.throws(()=>assertFinancialHistoryCatalog(c),/postcondition_failed/u);}
});

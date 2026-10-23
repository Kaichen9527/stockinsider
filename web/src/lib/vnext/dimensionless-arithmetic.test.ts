import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateClaim,type Evidence,type Claim} from './research.ts';
const period='2026-06-30';
const evidence=(units:string[],values:number[]=units.map((_,i)=>i===0?10:20)):Evidence[]=>units.map((unit,index)=>({id:`synthetic-${index}`,key:index===0?'quarterly_diluted_eps':'pe_multiple',value:values[index],unit,period,kind:'fact',sourceTier:'official',source:'https://www.twse.com.tw/synthetic-unit-vector',contentHash:String(index+1).repeat(64),eventAt:'2026-10-21T05:00:00.000Z',availableAt:'2026-10-21T06:00:00.000Z'}));
function check(operation:'multiply'|'divide'|'add'|'subtract',rows:Evidence[],unit:string,value:number){
 const claim:Claim={id:'synthetic-result',kind:'derived',text:'Synthetic numerical unit test, not validated acquisition or semantic research.',evidenceIds:rows.map(e=>e.id),numeric:{key:'valuation_base',value,unit,period,formula:{operation,evidenceIds:rows.map(e=>e.id)}}};
 return validateClaim(claim,rows);
}
test('original EPS unit times original dimensionless PE preserves per-share output, including scalar-first order',()=>{
 assert.deepEqual(check('multiply',evidence(['TWD_per_share','dimensionless']),'TWD_per_share',200),[]);
 assert.deepEqual(check('multiply',evidence(['dimensionless','TWD_per_share']),'TWD_per_share',200),[]);
});
test('EPS divided by dimensionless retains its original unit and does not permit reciprocal unit invention',()=>{
 assert.deepEqual(check('divide',evidence(['TWD_per_share','dimensionless']),'TWD_per_share',0.5),[]);
 assert.ok(check('divide',evidence(['dimensionless','TWD_per_share']),'TWD_per_share',0.5).includes('claim_formula_unit_mismatch:synthetic-result'));
});
test('existing ratio/multiple scalar semantics and same-unit ratio remain valid',()=>{
 for(const scalar of ['ratio','multiple']){assert.deepEqual(check('multiply',evidence(['TWD_per_share',scalar]),'TWD_per_share',200),[]);assert.deepEqual(check('divide',evidence(['TWD_per_share',scalar]),'TWD_per_share',0.5),[]);}
 assert.deepEqual(check('divide',evidence(['TWD','TWD']),'ratio',0.5),[]);
 assert.deepEqual(check('multiply',evidence(['dimensionless','TWD_per_share','multiple'],[2,10,3]),'TWD_per_share',60),[]);
});
test('cashflow and share counts cannot be relabelled as price; exact input unit and one nonscalar are required',()=>{
 for(const units of [['TWD','dimensionless'],['share','dimensionless'],['TWD_thousand','dimensionless'],['TWD_per_share','TWD']])assert.ok(check('multiply',evidence(units),'TWD_per_share',200).includes('claim_formula_unit_mismatch:synthetic-result'));
 assert.ok(check('multiply',evidence(['TWD_per_share','dimensionless']),'TWD',200).includes('claim_formula_unit_mismatch:synthetic-result'));
 assert.ok(check('multiply',evidence(['dimensionless','dimensionless']),'dimensionless',200).includes('claim_formula_unit_mismatch:synthetic-result'));
 assert.ok(check('multiply',evidence(['TWD_per_share','dimensionless']),'TWD/share',200).includes('claim_formula_unit_mismatch:synthetic-result'));
});
test('output scalar is rejected even when it appears in operands; SQL successor must match this actual TS rule',()=>{
 for(const scalar of ['ratio','multiple','dimensionless'])assert.ok(check('multiply',evidence(['TWD_per_share',scalar]),scalar,200).includes('claim_formula_unit_mismatch:synthetic-result'));
});
test('divide zero, wrong arithmetic and mismatched periods still reject',()=>{
 assert.ok(check('divide',evidence(['TWD_per_share','dimensionless'],[10,0]),'TWD_per_share',0).includes('claim_formula_zero_denominator:synthetic-result'));
 assert.ok(check('multiply',evidence(['TWD_per_share','dimensionless']),'TWD_per_share',999).includes('claim_formula_result_mismatch:synthetic-result'));
 const mixed=evidence(['TWD_per_share','dimensionless']);mixed[1].period='2026-03-31';assert.ok(check('multiply',mixed,'TWD_per_share',200).includes('claim_formula_inputs_invalid:synthetic-result'));
});
test('addition/subtraction and arbitrary multiplier units gain no compatibility from this change',()=>{
 assert.ok(check('add',evidence(['TWD_per_share','dimensionless']),'TWD_per_share',30).includes('claim_formula_unit_mismatch:synthetic-result'));
 assert.ok(check('subtract',evidence(['TWD_per_share','dimensionless']),'TWD_per_share',-10).includes('claim_formula_unit_mismatch:synthetic-result'));
 assert.ok(check('multiply',evidence(['TWD_per_share','percent']),'TWD_per_share',200).includes('claim_formula_unit_mismatch:synthetic-result'));
 assert.ok(check('divide',evidence(['TWD_per_share','dimensionless','dimensionless'],[10,2,5]),'TWD_per_share',1).includes('claim_formula_unit_mismatch:synthetic-result'));
});
test('SQL candidate has exact source predecessor/inverse and only the three declared arithmetic fragments',()=>{
 const profile=JSON.parse(readFileSync(new URL('../../../../scripts/opportunity-v3/vnext-dimensionless-arithmetic-profile-v1.json',import.meta.url),'utf8'));
 const sql=readFileSync(new URL('../../../../migrations/20261022_vnext_dimensionless_arithmetic_v1.sql',import.meta.url),'utf8');
 const original=/\$replacement\$([\s\S]*?)\$replacement\$/u.exec(readFileSync(new URL('../../../../migrations/20261022_vnext_financial_summary_v1.sql',import.meta.url),'utf8'))![1];
 const hash=(s:string)=>createHash('sha256').update(s).digest('hex');assert.equal(hash(original),profile.predecessorBodySha256);let changed=original;
 assert.equal(profile.fragments.length,3);for(const [old,next] of profile.fragments){assert.equal(changed.split(old).length-1,1);changed=changed.replace(old,next);}
 assert.equal(hash(changed),profile.successorBodySha256);for(const [old,next] of [...profile.fragments].reverse())changed=changed.replace(next,old);assert.equal(changed,original);
 assert.equal(hash(sql),profile.migrationSha256);assert.equal(profile.nativeVerified,false);assert.ok(sql.includes('vnext_dimensionless_namespace_changed'));assert.ok(sql.includes('vnext_dimensionless_metadata_changed'));assert.ok(!/GRANT |REVOKE |ALTER ROLE|ALTER TABLE|CREATE FUNCTION/u.test(sql));
 assert.ok(profile.fragments[1][1].includes("scalar_unit NOT IN('ratio','multiple','dimensionless')"));assert.ok(profile.fragments[1][1].includes("scalar_unit=num->>'unit'"));
});

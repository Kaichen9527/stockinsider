import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {MIGRATIONS,parseArguments,applyReviewedMigrationPlanToClient} from './apply-reviewed-migrations.mjs';
import {FINANCIAL_TAIL,selectFinancialHistoryChain,orderedHash} from './financial-history-install-guard.mjs';
import {OWNERSHIP_PRELUDE,OWNERSHIP_PRELUDE_SHA256,FINANCIAL_EXISTING_PROFILE_SHA256,makeFinancialExistingSchemaProfile,assertFinancialExistingSchemaPlan,assertFinancialProfileReviewBinding} from './financial-existing-schema-profile.mjs';
const load=relativePath=>{const bytes=fs.readFileSync(relativePath);return {relativePath,bytes,sha256:createHash('sha256').update(bytes).digest('hex')};};
const chain=selectFinancialHistoryChain(MIGRATIONS.map(load),load(FINANCIAL_TAIL),true);const profile=makeFinancialExistingSchemaProfile(chain,load(OWNERSHIP_PRELUDE));const plan={migrations:chain,chainSha256:orderedHash(chain),financialExistingSchemaProfile:profile};
test('default48 and ordinary financial49 outputs remain byte-equivalent; profile separately reports 50 steps',()=>{
 const run=args=>execFileSync(process.execPath,['scripts/opportunity-v3/migration-plan.mjs',...args],{encoding:'utf8'});
 for(const [args,file] of [[[],'original-default48.json'],[['--financial-history-extension'],'original-financial49.json']])assert.equal(run(args),fs.readFileSync(`.agent/reports/2026-10-12T12-55-financial-owner-profile/${file}`,'utf8'));
 const data=JSON.parse(run(['--financial-existing-schema-profile']));assert.equal(data.migrations.length,49);assert.equal(data.orderedChainSha256,orderedHash(chain));assert.equal(data.financialExistingSchemaProfile.steps,50);assert.equal(data.financialExistingSchemaProfile.orderedProfileSha256,FINANCIAL_EXISTING_PROFILE_SHA256);assert.equal(data.financialExistingSchemaProfile.preludes[0].sha256,OWNERSHIP_PRELUDE_SHA256);assert.equal(data.applyAuthorized,false);
});
test('missing/wrong prelude bytes/hash/order/chain and profile omission reject',()=>{
 for(const prelude of [null,{...load(OWNERSHIP_PRELUDE),relativePath:FINANCIAL_TAIL},{...load(OWNERSHIP_PRELUDE),sha256:'0'.repeat(64)},{...load(OWNERSHIP_PRELUDE),bytes:Buffer.from('BEGIN; COMMIT;')}])assert.throws(()=>makeFinancialExistingSchemaProfile(chain,prelude),/mismatch/u);
 assert.throws(()=>makeFinancialExistingSchemaProfile(chain.toReversed(),load(OWNERSHIP_PRELUDE)),/chain_mismatch/u);
 assert.throws(()=>makeFinancialExistingSchemaProfile(chain.slice(0,48),load(OWNERSHIP_PRELUDE)),/chain_mismatch/u);
 assert.throws(()=>assertFinancialExistingSchemaPlan({migrations:chain,chainSha256:orderedHash(chain)},{financialExistingSchemaProfile:true}),/profile_missing/u);
 assert.throws(()=>assertFinancialExistingSchemaPlan(plan,{}),/flag_required/u);
 assert.throws(()=>assertFinancialExistingSchemaPlan({...plan,chainSha256:'0'.repeat(64)},{financialExistingSchemaProfile:true}),/chain_mismatch/u);
 assert.throws(()=>assertFinancialExistingSchemaPlan(plan,{financialExistingSchemaProfile:'true'}),/flag_invalid/u);
 assert.throws(()=>assertFinancialExistingSchemaPlan({...plan,financialExistingSchemaProfile:{...profile,orderedProfileSha256:'0'.repeat(64)}},{financialExistingSchemaProfile:true}),/profile_missing/u);
});
test('profile flag conflict/duplicates and absent/duplicate/wrong literal fail closed',()=>{
 const base=['--apply','--source-commit','1'.repeat(40),'--attestation-commit','2'.repeat(40)];
 assert.equal(parseArguments([...base,'--financial-existing-schema-profile']).financialExistingSchemaProfile,true);
 for(const flags of [['--financial-history-extension','--financial-existing-schema-profile'],['--financial-existing-schema-profile','--financial-existing-schema-profile']])assert.throws(()=>parseArguments([...base,...flags]),/conflict|invalid_arguments/u);
 const literal=`Financial existing-schema ordered profile SHA256: ${FINANCIAL_EXISTING_PROFILE_SHA256}`;assertFinancialProfileReviewBinding(literal,FINANCIAL_EXISTING_PROFILE_SHA256);
 for(const review of ['',literal+'\n'+literal,literal+'\n'+literal.replace(FINANCIAL_EXISTING_PROFILE_SHA256,'0'.repeat(64)),literal+'\n  '+literal,literal.replace(FINANCIAL_EXISTING_PROFILE_SHA256,'0'.repeat(64))])assert.throws(()=>assertFinancialProfileReviewBinding(review,FINANCIAL_EXISTING_PROFILE_SHA256),/binding_missing/u);
});
test('actual installer checks successor and profile under lock/BEGIN before any prelude query',async()=>{
 const calls=[];const client={query:async sql=>{calls.push(sql);if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};if(sql.includes(' AS observations'))return {rows:[{observations:false,wrapper:false,reader:false,residue:false,unknown_successor:true}]};return {rows:[]};},end:async()=>{}};
 await assert.rejects(applyReviewedMigrationPlanToClient(client,plan,{financialExistingSchemaProfile:true}),/unknown_research/u);assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.some(x=>x.includes('DO $ownership_bridge$')));
});

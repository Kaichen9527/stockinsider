import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),pg=require('pg');let connectionAttempted=0;
pg.Client=new Proxy(pg.Client,{construct(){connectionAttempted++;throw Error('readonly_plan_must_not_construct_database_client');}});
const {reviewedMigrationPlan}=await import('/tmp/stockinsider-discovery-release-root-review-oct14/scripts/opportunity-v3/apply-reviewed-migrations.mjs');
const options={sourceCommit:'18b1fba4c7fa89108cbf8892a0a7205860989995',attestationCommit:'73fafb9ec5c4d3fc67afe00c9fdc6a7f85b1d5f0',financialExistingSchemaProfile:true,privateVpsPeerOperator:true,bootstrapVpsRuntimeRole:true};
const p=reviewedMigrationPlan(options);
console.log(JSON.stringify({source:options.sourceCommit,evidence:options.attestationCommit,selectedMigrations:p.migrations.length,orderedChainSha256:p.chainSha256,profile:p.financialExistingSchemaProfile,operator:p.operatorPrerequisite,connectionAttempted:connectionAttempted!==0}));

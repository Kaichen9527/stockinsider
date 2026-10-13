import {reviewedMigrationPlan} from '/tmp/stockinsider-financial-binding-root-review-oct14/scripts/opportunity-v3/apply-reviewed-migrations.mjs';
const options={apply:true,sourceCommit:'fbc1e9b4445d388b8f954e1a3827afa4ecfb6c55',attestationCommit:'52b48944cc64b0f459e33e27ea5027aa7d18d476',financialExistingSchemaProfile:true,privateVpsPeerOperator:true,bootstrapVpsRuntimeRole:true};
const p=reviewedMigrationPlan(options);
console.log(JSON.stringify({source:options.sourceCommit,attestation:options.attestationCommit,chain:p.chainSha256,migrations:p.migrations.length,profile:p.financialExistingSchemaProfile.orderedProfileSha256,steps:p.financialExistingSchemaProfile.steps,action:p.operatorPrerequisite.actionSha256,connectionAttempted:false}));

import {createHash} from 'node:crypto';
import {orderedHash} from './financial-history-install-guard.mjs';
export const OWNERSHIP_PRELUDE='migrations/20261005_release_function_ownership_bridge_v1.sql';
export const OWNERSHIP_PRELUDE_SHA256='d86fb28d4b23b95b1b1c97d9eedf418f8162610171e72dccc9b5a88f1fada747';
export const FINANCIAL49_SHA256='cec630ce83aea1f7bdcafae815990e2e964ebbf599a3441e08d978e4427f46cd';
export const FINANCIAL_EXISTING_PROFILE_SHA256='acdee42a8ca130d259541b5c0b4b14e228c355528b60a2ac4ea3ef9633d611d9';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function assertFinancialProfileFlags(options) {
 for(const key of ['financialExistingSchemaProfile','financialHistoryExtension'])if(options[key]!==undefined&&typeof options[key]!=='boolean')throw Error('financial_profile_flag_invalid');
 if(options.financialExistingSchemaProfile && options.financialHistoryExtension)throw Error('financial_profile_flag_conflict');
}
export function makeFinancialExistingSchemaProfile(migrations,prelude) {
 if(migrations.length!==49 || orderedHash(migrations)!==FINANCIAL49_SHA256
   || migrations.some(m=>!Buffer.isBuffer(m.bytes)||hash(m.bytes)!==m.sha256))throw Error('financial_existing_chain_mismatch');
 if(!prelude || prelude.relativePath!==OWNERSHIP_PRELUDE || prelude.sha256!==OWNERSHIP_PRELUDE_SHA256
   || !Buffer.isBuffer(prelude.bytes) || hash(prelude.bytes)!==OWNERSHIP_PRELUDE_SHA256)throw Error('financial_existing_prelude_mismatch');
 if(orderedHash([prelude,...migrations])!==FINANCIAL_EXISTING_PROFILE_SHA256)throw Error('financial_existing_profile_order_mismatch');
 return Object.freeze({schema:'financial-existing-schema-profile-v1',preludes:Object.freeze([prelude]),orderedProfileSha256:FINANCIAL_EXISTING_PROFILE_SHA256,steps:50});
}
export function assertFinancialExistingSchemaPlan(plan,options) {
 assertFinancialProfileFlags(options);
 if(!options.financialExistingSchemaProfile){if(plan.financialExistingSchemaProfile!==undefined)throw Error('financial_existing_profile_flag_required');return;}
 if(plan.chainSha256!==FINANCIAL49_SHA256)throw Error('financial_existing_chain_mismatch');
 const profile=plan.financialExistingSchemaProfile;
 if(!profile || profile.schema!=='financial-existing-schema-profile-v1' || profile.preludes?.length!==1 || profile.steps!==50
   || profile.orderedProfileSha256!==FINANCIAL_EXISTING_PROFILE_SHA256)throw Error('financial_existing_profile_missing');
 makeFinancialExistingSchemaProfile(plan.migrations,profile.preludes[0]);
}
export function assertFinancialProfileReviewBinding(review,hash) {
 const prefix='Financial existing-schema ordered profile SHA256:';
 const literals=review.split(/\r?\n/u).filter(line=>line.trimStart().startsWith(prefix));
 if(hash!==FINANCIAL_EXISTING_PROFILE_SHA256 || literals.length!==1 || literals[0]!==`${prefix} ${hash}`)
  throw Error('financial_existing_profile_review_binding_missing');
}

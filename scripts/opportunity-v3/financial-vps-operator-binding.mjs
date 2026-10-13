import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {FINANCIAL_EXISTING_PROFILE_SHA256} from './financial-existing-schema-profile.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const PEER_SOURCE_SHA256='a488b4b25141ac5f23b6a859d2366ec2c91907441b10fd3ed810bd6c5dc695c9';
export function assertOperatorFlags(options) {
 for(const key of ['privateVpsPeerOperator','bootstrapVpsRuntimeRole'])if(options[key]!==undefined&&typeof options[key]!=='boolean')throw Error('financial_operator_flag_invalid');
 if(options.privateVpsPeerOperator||options.bootstrapVpsRuntimeRole) {
  if(options.privateVpsPeerOperator!==true||options.bootstrapVpsRuntimeRole!==true||options.financialExistingSchemaProfile!==true||options.financialHistoryExtension===true)throw Error('financial_operator_flags_required');
 }
}
export function financialOperatorActionIdentity() {
 const paths=['scripts/opportunity-v3/vps-migration-peer.mjs','scripts/opportunity-v3/financial-vps-operator-action.mjs','scripts/opportunity-v3/financial-vps-operator-binding.mjs'];
 const sources=paths.map(relativePath=>({relativePath,sha256:hash(fs.readFileSync(path.join(root,relativePath)))}));
 if(sources[0].sha256!==PEER_SOURCE_SHA256)throw Error('financial_operator_peer_source_mismatch');
 const action={schema:'financial-vps-operator-prerequisite-v1',action:'bootstrapVpsRuntimeRole',profileSha256:FINANCIAL_EXISTING_PROFILE_SHA256,sources};
 return {...action,actionSha256:hash(JSON.stringify(action))};
}
export function assertOperatorPlan(plan,options) {
 assertOperatorFlags(options);
 if(!options.bootstrapVpsRuntimeRole){if(plan.operatorPrerequisite!==undefined)throw Error('financial_operator_flag_required');return;}
 if(!isDeepStrictEqual(plan.operatorPrerequisite,financialOperatorActionIdentity()))throw Error('financial_operator_action_identity_mismatch');
}
export function assertOperatorReviewBinding(review,action) {
 if(!isDeepStrictEqual(action,financialOperatorActionIdentity()))throw Error('financial_operator_action_identity_mismatch');
 const prefix='Financial VPS operator prerequisite SHA256:';
 const rows=review.split(/\r?\n/u).filter(line=>line.trimStart().startsWith(prefix));
 if(rows.length!==1||rows[0]!==`${prefix} ${action.actionSha256}`)throw Error('financial_operator_review_binding_missing');
}

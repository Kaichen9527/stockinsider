/** Numeric fixtures for native tests of the original provider schema.
 * That schema accepts explicit scalars but cannot carry interval metadata
 * for reported cash flows. No actual issuer data or valuation is asserted. */
import {inputHash} from '../web/src/lib/vnext/policy.ts';
import {input,authorOutput,reviewerOutput} from './vnext-synthetic-research-vectors.mjs';

const keys=['pe_multiple','pb_multiple'];
const claimId='synthetic-multiple-ratio';

export function scalarInput(symbol){
 const original=input(symbol);
 const evidence=original.evidence.map((item,index)=>{
  if(index>=keys.length)return item;
  const fact={...item,key:keys[index],unit:'multiple',source:'https://www.twse.com.tw/synthetic-worker/'+keys[index]};
  return {...fact,contentHash:inputHash({...fact,contentHash:undefined})};
 });
 const frozen={...original,evidence};
 return {...frozen,hash:inputHash({...frozen,hash:undefined})};
}

export function scalarAuthorOutput(){
 const output=authorOutput();
 const ratio=output.claims.find(claim=>claim.id==='cash-conversion');
 ratio.id=claimId;
 ratio.text='The ratio of the two synthetic multiples is 0.5. It supplies no valuation authority.';
 ratio.numeric.key='synthetic_multiple_ratio';
 for(const section of Object.values(output.sections)){
  section.text='This engineering example compares the same-period synthetic multiples.';
  section.claimIds=[claimId];
 }
 return output;
}

export function scalarReviewerOutput(document){
 const output=reviewerOutput(document);
 const checked=output.claimChecks.find(check=>check.claimId===claimId);
 checked.reason='Synthetic comparison of the exact same-period evidence and its recomputed ratio.';
 return output;
}

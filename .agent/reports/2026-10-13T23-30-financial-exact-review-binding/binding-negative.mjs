import assert from 'node:assert/strict';
import {assertFinancialReviewBinding} from '/tmp/stockinsider-financial-release-root-review-oct13/scripts/opportunity-v3/financial-history-install-guard.mjs';
const hash='cec630ce83aea1f7bdcafae815990e2e964ebbf599a3441e08d978e4427f46cd';
const literal=`Financial history ordered chain SHA256: ${hash}`;
const review=literal+'\nFinancial history ordered chain SHA256: '+'0'.repeat(64)+'\n';
console.log(JSON.stringify({case:'one correct binding plus a conflicting second financial-chain binding must reject',review,hash}));
assert.throws(()=>assertFinancialReviewBinding(review,hash),/financial_chain_review_binding_missing/u);

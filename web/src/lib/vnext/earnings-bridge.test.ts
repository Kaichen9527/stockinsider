import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateEarningsBridge,type EarningsBridgeInput,type EarningsBridgeOperand } from './earnings-bridge.ts';

const scope={symbol:'2454',periodStart:'2027-01-01',periodEnd:'2027-12-31'};
const cutoff='2026-11-18T13:30:00Z';
const row=(value:number,unit:EarningsBridgeOperand['unit']='TWD',shareBasis?:EarningsBridgeOperand['shareBasis']):EarningsBridgeOperand=>({
  ...scope,value,unit,basis:'model_assumption',knownAt:'2026-11-18T05:00:00Z',
  sourceRef:'controlled-scenario-input',sourceSha256:'a'.repeat(64),...(shareBasis?{shareBasis}:{}),
});
function model():EarningsBridgeInput {
  return {...scope,periodKind:'next_four_quarters',classification:'modeled_scenario',shareBasis:'diluted',cutoff,operands:{
    operatingIncome:row(1000),netNonoperatingIncome:row(-20),incomeTaxExpense:row(180),noncontrollingIncome:row(30),
    ordinaryNumeratorAdjustment:row(10,'TWD','diluted'),weightedAverageShares:row(120,'shares','diluted'),peMultiple:row(150000,'multiple_x10000'),
  }};
}

test('the bridge keeps each signed accounting stage and prices from the exact denominator',()=>{
  const input=model();
  const output=calculateEarningsBridge(input);
  assert.equal(output.pretaxIncomeTwd,'980');
  assert.equal(output.netIncomeTwd,'800');
  assert.equal(output.parentIncomeTwd,'770');
  assert.deepEqual(output.eps,{numeratorTwd:'780',denominatorShares:'120',amount:'6.500000',roundedToCents:'6.50'});
  assert.deepEqual(output.valuation,{peMultiple:'15.0000',targetPriceTwd:'97.50'});
  assert.deepEqual(output.missing,[]);
  assert.equal(output.receipts.noncontrollingIncome?.value,30);
  assert.equal(output.receipts.weightedAverageShares?.shareBasis,'diluted');
  input.operands.ordinaryNumeratorAdjustment=row(0,'TWD','diluted');
  input.operands.weightedAverageShares=row(333,'shares','diluted');
  const exact=calculateEarningsBridge(input);
  assert.equal(exact.eps?.amount,'2.312312');
  assert.equal(exact.valuation?.targetPriceTwd,'34.68');
});

test('missing assumptions preserve downstream nulls while an explicit zero remains known',()=>{
  const input=model();
  input.operands.netNonoperatingIncome=row(0);
  input.operands.incomeTaxExpense=null;
  const output=calculateEarningsBridge(input);
  assert.equal(output.pretaxIncomeTwd,'1000');
  assert.equal(output.netIncomeTwd,null);
  assert.equal(output.parentIncomeTwd,null);
  assert.equal(output.eps,null);
  assert.equal(output.valuation,null);
  assert.equal(output.valuationGap,'earnings_incomplete');
  assert.deepEqual(output.missing,['incomeTaxExpense']);
  assert.equal(output.receipts.netNonoperatingIncome?.value,0);
});

test('nonpositive EPS is preserved and can never receive a price',()=>{
  for (const op of [-500,220]) {
    const input=model();
    input.operands.operatingIncome=row(op);
    const output=calculateEarningsBridge(input);
    assert.ok(Number(output.eps?.amount)<=0);
    assert.equal(output.valuation,null);
    assert.equal(output.valuationGap,'nonpositive_eps');
  }
});

test('one quarter remains one quarter and is never annualized for a P/E price',()=>{
  const input=model();
  input.periodKind='fiscal_quarter';
  input.periodEnd='2027-03-31';
  for (const operand of Object.values(input.operands)) if(operand)operand.periodEnd=input.periodEnd;
  const output=calculateEarningsBridge(input);
  assert.equal(output.eps?.amount,'6.500000');
  assert.equal(output.valuation,null);
  assert.equal(output.valuationGap,'annual_earnings_period_required');
});

test('other issuer, period, unit, share basis, future receipt or missing identity is rejected',()=>{
  for(const patch of [{symbol:'2330'},{periodEnd:'2027-03-31'},{unit:'TWD'},{shareBasis:'basic'},
    {knownAt:'2026-11-18T13:30:00.000001Z'},{sourceSha256:'unknown'},{sourceRef:'\n'},{value:0},{basis:'reported'}]){
    const input=model();
    Object.assign(input.operands.weightedAverageShares!,patch);
    assert.throws(()=>calculateEarningsBridge(input),/operand_invalid:weightedAverageShares/u);
  }
  assert.throws(()=>calculateEarningsBridge({...model(),periodEnd:'2027-06-30'}),/scope_invalid/u);
});

test('reported quarterly reconciliation retains basis and refuses model inputs or a forward period',()=>{
  const input=model();
  input.classification='reported_reconciliation';
  input.periodKind='fiscal_quarter';
  input.periodStart='2026-07-01';
  input.periodEnd='2026-09-30';
  delete input.operands.peMultiple;
  for (const operand of Object.values(input.operands)) if(operand)Object.assign(operand,{
    periodStart:input.periodStart,periodEnd:input.periodEnd,basis:'reported'});
  const output=calculateEarningsBridge(input);
  assert.equal(output.eps?.roundedToCents,'6.50');
  assert.equal(output.valuationGap,'reported_period_only');
  Object.assign(input.operands.netNonoperatingIncome!,{basis:'model_assumption'});
  assert.throws(()=>calculateEarningsBridge(input),/operand_invalid:netNonoperatingIncome/u);
  assert.throws(()=>calculateEarningsBridge({...input,periodKind:'next_four_quarters',periodStart:'2025-10-01'}),/reported_scope_invalid/u);
});

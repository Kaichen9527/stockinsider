import {readFileSync} from 'node:fs';
import {validateOfficialFinancialFact} from '../web/src/lib/official-financial-validation.ts';

// Read-only evaluator: input contains financial facts/provenance, never keys.
// This command cannot connect to the database or mutate a validation status.
const input=JSON.parse(readFileSync(0,'utf8'));
const counts={facts:input.facts.length,eligible:0,rejected:0,reasons:{},symbols:{}};
for(const fact of input.facts){
  const peers=input.facts.filter(row=>row.stock_id===fact.stock_id);
  const provenance=input.provenance.find(row=>row.fact_id===fact.fact_id)||null;
  const result=validateOfficialFinancialFact(fact,peers,provenance,input.evaluatedAt);
  const symbol=input.symbols[fact.stock_id];
  counts.symbols[symbol]??={eligible:0,rejected:0,reasons:{}};
  const outcome=result.reasons.length===0?'eligible':'rejected';
  counts[outcome]++;counts.symbols[symbol][outcome]++;
  for(const reason of result.reasons){
    counts.reasons[reason]=(counts.reasons[reason]||0)+1;
    counts.symbols[symbol].reasons[reason]=(counts.symbols[symbol].reasons[reason]||0)+1;
  }
}
console.log(JSON.stringify(counts,null,2));

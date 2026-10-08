import assert from 'node:assert/strict';
export const financialNumber=value=>value===null?'未核':value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function researchTable(headers,rows){assert.ok(headers.length>0&&rows.every(r=>r.length===headers.length));return ['|'+headers.join('|')+'|','|'+headers.map(()=> '---').join('|')+'|',...rows.map(row=>'|'+row.map(cell=>typeof cell==='number'?financialNumber(cell):cell).join('|')+'|')].join('\n');}
export function renderResearchTokens(template,tokens){let text=template;for(const [key,value]of Object.entries(tokens))text=text.replaceAll('{{'+key+'}}',String(value));assert.ok(!text.includes('{{'),'unresolved research token');return text;}

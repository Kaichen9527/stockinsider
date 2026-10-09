import { createHash } from 'node:crypto';
import { financialInstant } from './research-financial-clock.ts';
type Row = Record<string, unknown>;
export function completeEnsure(ok: unknown): asserts ok { if (!ok) throw new Error('research_complete_input_invalid'); }
function scalar(s: string) { completeEnsure(!/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s)); return s; }
function decimal(n: number) {
 completeEnsure(Number.isFinite(n)); const s=JSON.stringify(n),[m,e]=s.toLowerCase().split('e'); if(!e)return s;
 const negative=m.startsWith('-'),parts=(negative?m.slice(1):m).split('.'),digits=parts.join(''),point=parts[0].length+Number(e);
 return (negative?'-':'')+(point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point));
}
export function completeCanonical(value: unknown, depth=0): string {
 completeEnsure(depth<=12);
 if(value===null)return '["n"]';
 if(typeof value==='boolean')return '["b",'+value+']';
 if(typeof value==='number')return JSON.stringify(['d',decimal(value)]);
 if(typeof value==='string')return JSON.stringify(['s',scalar(value)]);
 if(Array.isArray(value))return '["a",['+value.map(v=>completeCanonical(v,depth+1)).join(',')+']]';
 completeEnsure(value && typeof value==='object' && Object.getPrototypeOf(value)===Object.prototype);
 const row=value as Row,keys=Object.keys(row).sort((a,b)=>Buffer.compare(Buffer.from(scalar(a)),Buffer.from(scalar(b))));
 return '["o",['+keys.map(k=>'['+JSON.stringify(k)+','+completeCanonical(row[k],depth+1)+']').join(',')+']]';
}
export const completeHash=(value:unknown)=>createHash('sha256').update(completeCanonical(value)).digest('hex');
/** Static schemas only; no dynamic refs, resolution or request-selected validators. */
export function validateCompleteSchema(value:unknown,schema:Row,clock:string,depth=0):void {
 completeEnsure(depth<=12);
 if(Object.hasOwn(schema,'const')){completeEnsure(completeCanonical(value)===completeCanonical(schema.const));return;}
 if(schema.type==='object'){
  completeEnsure(value&&typeof value==='object'&&!Array.isArray(value));const v=value as Row,p=schema.properties as Record<string,Row>;
  completeEnsure(Object.keys(v).sort().join(',')===Object.keys(p).sort().join(','));
  for(const key of Object.keys(p))validateCompleteSchema(v[key],p[key],clock,depth+1);return;
 }
 if(schema.type==='array'){const p=schema.prefixItems as Row[];completeEnsure(Array.isArray(value)&&value.length===p.length);value.forEach((v,i)=>validateCompleteSchema(v,p[i],clock,depth+1));return;}
 completeEnsure(schema.type==='string'&&typeof value==='string');scalar(value);
 if(schema.pattern)completeEnsure(new RegExp(String(schema.pattern),'u').test(value));
 if(schema.format==='date-time'){completeEnsure(value===clock&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value));financialInstant(value);}
}
/** Reject duplicate decoded object keys before JSON.parse loses them. */
export function parseCompleteJson(text:string):unknown {
 let i=0;const white=()=>{while(/\s/u.test(text[i]??'')&&i<text.length)i++;};
 const string=()=>{const start=i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')return scalar(JSON.parse(text.slice(start,i)));}throw new Error('research_complete_json_invalid');};
 const scan=(depth:number):void=>{completeEnsure(depth<=12);white();const ch=text[i];
  if(ch==='"'){string();return;}
  if(ch==='{'||ch==='['){i++;white();const end=ch==='{'?'}':']',keys=new Set<string>();if(text[i]===end){i++;return;}
   while(true){if(ch==='{'){completeEnsure(text[i]==='"');const key=string();completeEnsure(!keys.has(key));keys.add(key);white();completeEnsure(text[i++]===':');}scan(depth+1);white();if(text[i]===end){i++;return;}completeEnsure(text[i++ ]===',');white();}}
  const token=/^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(text.slice(i));completeEnsure(token);i+=token[0].length;
 };
 scan(0);white();completeEnsure(i===text.length);const value:unknown=JSON.parse(text);completeCanonical(value);return value;
}

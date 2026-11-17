import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const migration=(file)=>fs.readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8');
const base=migration('20261115_vnext_launch_source_facts_v1.sql');
const candidate=migration('20261116_29_vnext_launch_twse_turnover_source_v1.sql');
function routine(source,name){
 const start=source.indexOf('CREATE FUNCTION public.'+name+'(');
 assert.notEqual(start,-1);
 const tail=source.slice(start);
 const opening=/\bAS (\$[a-z_]*\$)/u.exec(tail);
 assert.ok(opening);
 const end=tail.indexOf(opening[1]+';',opening.index+opening[0].length);
 assert.ok(end>opening.index);
 return tail.slice(0,end+opening[1].length+1);
}
const spec={datasetId:11549,sessionDate:'2026-11-16',header:["日期","證券代號","證券名稱","成交股數","成交金額","開盤價","最高價","最低價","收盤價","漲跌價差","成交筆數"]};
const csvLine=(row)=>row.map(cell=>'"'+String(cell).replaceAll('"','""')+'"').join(',');
const csv=(rows)=>Buffer.from([csvLine(spec.header),...rows.map(csvLine)].join('\r\n')+'\r\n');
const sourceRow=['1151116','2330','Example, "Issuer"','42,000','2,500,123','--','--','--','--','0','10'];

test('native TWSE turnover decoder binds a complete report to its Taipei session',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'launch-twse-turnover-pg-'));
 const data=path.join(root,'pg'),port=String(55000+process.pid%5000);
 const binary=(name)=>process.env.OPPORTUNITY_V3_POSTGRES_BIN?path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN,name):name;
 const run=(name,args,input)=>spawnSync(binary(name),args,{input,encoding:'utf8',timeout:30000,env:{...process.env,LC_ALL:'C',TZ:'UTC'}});
 const check=(r)=>{assert.equal(r.status,0,r.error?.message||r.stderr||r.stdout);return r.stdout.trim();};
 const psql=(input)=>run('psql',['-X','-q','-At','-v','ON_ERROR_STOP=1','-h',root,'-p',port,'-U','lab','-d','postgres'],input);
 const query=(buffer,requested=spec)=>`SELECT public.vnext_launch_twse_turnover_derive_v1($profile$${JSON.stringify(requested)}$profile$::jsonb,
  decode('${buffer.toString('hex')}','hex'));\n`;
 let running=false;
 try{
  check(run('initdb',['-D',data,'-U','lab','-A','trust','--no-locale','--encoding=UTF8']));
  check(run('pg_ctl',['-D',data,'-l',path.join(root,'pg.log'),'-o',`-c listen_addresses= -k ${root} -p ${port}`,'-w','start']));
  running=true;
  const setup=['vnext_launch_csv_rows_v1','vnext_launch_csv_integer_v1','vnext_launch_csv_date_v1'].map(name=>routine(base,name)).join('\n');
  check(psql(setup+`
   CREATE FUNCTION public.vnext_launch_csv_hash_v1(value jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex')
   $$;`+routine(candidate,'vnext_launch_twse_turnover_derive_v1')));
  const other=[...sourceRow];other[1]='0050L';
  const parsed=JSON.parse(check(psql(query(csv([sourceRow,other])))));
  assert.equal(parsed.rowCount,2);
  assert.deepEqual(parsed.facts,[{session:'2026-11-16',symbol:'2330',shares:42000,tradedNtd:2500123}]);
  assert.deepEqual(parsed.pool.targets,[]);
  const wrongDay=[...sourceRow];wrongDay[0]='1151117';
  const badAmount=[...sourceRow];badAmount[4]='';
  for(const [bad,error] of [
   [csv([sourceRow,wrongDay]),/wrong_session_or_symbol/],[csv([sourceRow,sourceRow]),/duplicate_symbol/],
   [csv([badAmount]),/integer_invalid/],[csv([[...sourceRow,'extra']]),/turnover_schema/],
  ]){
   const refused=psql(query(bad));
   assert.notEqual(refused.status,0);
   assert.match(refused.stderr,error);
  }
  const actual=process.env.STOCKINSIDER_TWSE_11549_NATIVE_CSV;
  if(actual){
   const bytes=fs.readFileSync(actual);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),'568dad96c525b1dae3f72e4fc1f94edc3491c1fee988fc8a97d0fb9e13433000');
   const day=JSON.parse(check(psql(query(bytes))));
   assert.equal(day.rowCount,1390);
   assert.equal(day.facts.length,1099);
   assert.ok(day.facts.every(fact=>fact.session==='2026-11-16'&&Number.isSafeInteger(fact.tradedNtd)&&fact.tradedNtd>=0));
   const stale=psql(query(bytes,{...spec,sessionDate:'2026-11-13'}));
   assert.notEqual(stale.status,0);
   assert.match(stale.stderr,/wrong_session_or_symbol/);
   console.log('Official TWSE 11549 receipt parsed with 1390 records and 1099 four-digit amounts; stale key rejected.');
  }
 }finally{
  if(running)check(run('pg_ctl',['-D',data,'-w','-m','immediate','stop']));
  fs.rmSync(root,{recursive:true,force:true});
 }
});

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {captureLaunchHaltSlots,readLaunchHaltCapture} from './launch-halt-capture.ts';
import {launchHaltSource} from './launch-opening-halt.ts';

const csv='編號,證券代號,證券名稱,暫停交易日期,暫停交易時間,恢復交易日期,恢復交易時間\n';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const response=(url:string,data:string,type:string)=>{
  const res=new Response(data,{headers:{'content-type':type}});
  Object.defineProperty(res,'url',{value:url});
  return res;
};
const auth=['stage-operator','owned-slot'] as const;
const clock='2026-11-15T09:00:00Z';

test('capture only approved due venues and never return source bytes to the action response',async()=>{
  const requests:string[]=[];
  const result=await captureLaunchHaltSlots({async rpc(name,args){
    assert.equal(name,'vnext_launch_halt_command_v1');
    assert.equal(args.p_lease_owner,auth[1]);
    if(args.p_action==='admit')return {data:{markets:['TWSE']},error:null};
    assert.equal(args.p_body,'\\x'+Buffer.from(csv).toString('hex'));
    assert.equal(args.p_sha256,sha(csv));
    return {data:{market:'TWSE',sha256:sha(csv),recordedAt:clock,replay:false},error:null};
  }},...auth,async(url,opts)=>{
    requests.push(String(url));
    assert.equal(opts?.redirect,'error');
    assert.equal(opts?.cache,'no-store');
    return response(String(url),csv,'text/csv;charset=UTF-8');
  });
  assert.deepEqual(requests,[launchHaltSource('TWSE')]);
  assert.deepEqual(result,[{market:'TWSE',status:'written'}]);
});
test('already captured or rejected admission performs no venue IO',async()=>{
  const fail:typeof fetch=async()=>{throw Error('unplanned fetch');};
  assert.deepEqual(await captureLaunchHaltSlots({async rpc(){return {data:{markets:[]},error:null};}},...auth,fail),[]);
  await assert.rejects(captureLaunchHaltSlots({async rpc(){return {data:{markets:['TPEX','TPEX']},error:null};}},...auth,fail),
    /launch_halt_admission_unavailable/u);
});
test('wrong MIME, redirect and oversize raw body are not written',async()=>{
  for(const [type,url,content] of [['application/json',launchHaltSource('TWSE'),csv],
    ['text/csv','https://invalid.example/haltdump',csv],['text/csv',launchHaltSource('TWSE'),'x'.repeat(524289)]]){
    let writes=0;
    const result=await captureLaunchHaltSlots({async rpc(_name,args){
      if(args.p_action==='admit')return {data:{markets:['TWSE']},error:null};
      writes++;return {data:null,error:null};
    }},...auth,async()=>response(url,content,type));
    assert.deepEqual(result,[{market:'TWSE',status:'deferred'}]);
    assert.equal(writes,0);
  }
});
test('cutoff read validates private capture bytes before returning them to the trusted worker',async()=>{
  const bodyBase64=Buffer.from(csv).toString('base64');
  const actual={market:'TWSE',observedAt:clock,recordedAt:clock,bodyBase64,sha256:sha(csv)};
  const read=(data:unknown)=>readLaunchHaltCapture({async rpc(_name,args){
    assert.equal(args.p_action,'read');assert.equal(args.p_as_of,clock);return {data,error:null};
  }},...auth,'TWSE',clock);
  assert.equal((await read(actual))?.sha256,sha(csv));
  assert.equal(await read({...actual,bodyBase64:bodyBase64+'='}),null);
  assert.equal(await read({...actual,sha256:'a'.repeat(64)}),null);
  assert.equal(await read({...actual,market:'TPEX'}),null);
});

test('calendar sync invokes the authorized capture once and leaves a source outage deferred',async()=>{
  const script=readFileSync(new URL('../../../../scripts/sync-official-trading-calendar.mjs',import.meta.url),'utf8')
    .replace("import { createHash } from 'node:crypto';",'');
  for(const enabled of [false,true]){
    const internal:Array<{path:string;body:unknown}>=[];
    const output:string[]=[];
    const env={APP_URL:'http://127.0.0.1:3101',INTERNAL_API_KEY:'fixture-only',STOCKINSIDER_LAUNCH_RANKING_ENABLED:String(enabled)};
    const fetchRequest:typeof fetch=async(raw,options)=>{
      const url=new URL(String(raw));
      if(url.hostname!=='127.0.0.1')return Response.json({stage:'calendar-fixture'});
      const body=JSON.parse(String(options?.body));
      internal.push({path:url.pathname,body});
      if(url.pathname==='/api/internal/official-calendar-backfill')return Response.json({ok:true,result:{accepted:1,written:1}});
      return Response.json({ok:false}, {status:503});
    };
    await vm.runInNewContext('(async()=>{'+script+'})()',{
      createHash,fetch:fetchRequest,AbortSignal,Buffer,Intl,Date,process:{env,stdout:{write:(line:string)=>output.push(line)}}
    });
    const summary=JSON.parse(output.join(''));
    assert.equal(summary.months.length,2);
    assert.equal(summary.ok,true);
    assert.equal(internal.length,enabled?3:2);
    if(enabled){
      assert.equal(internal[2].path,'/api/internal/vnext-research');
      assert.equal(JSON.stringify(internal[2].body),JSON.stringify({action:'capture-opening-halts'}));
      assert.equal(summary.openingHalts,'deferred');
    }else assert.equal(Object.hasOwn(summary,'openingHalts'),false);
  }
});

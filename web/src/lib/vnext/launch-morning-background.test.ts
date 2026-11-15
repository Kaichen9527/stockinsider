import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {parseLaunchMorningBackground,readLaunchMorningBackground,publishLaunchMorningBackground} from './launch-morning-background.ts';

const row={schemaVersion:'vnext-launch-morning-public-v1',session:'2026-11-09',previousSession:'2026-11-06',
 cutoff:'2026-11-09T00:15:00+00:00',twseClose:42000,tpexClose:330.12,revision:'a'.repeat(64)};
test('pre-open background only accepts the declared same-day slot and earlier trading session',()=>{
  assert.equal(parseLaunchMorningBackground(row)?.previousSession,'2026-11-06');
  for(const value of [{...row,cutoff:'2026-11-09T00:16:00Z'},{...row,cutoff:'2026-11-09T13:30:00Z'},
    {...row,previousSession:row.session},{...row,tpexClose:0},{...row,internalProof:'SYNTHETIC_PRIVATE'}])
    assert.equal(parseLaunchMorningBackground(value),null);
});

test('morning public read invokes only the whitelist RPC and an author cannot start the writer',async()=>{
  const calls:string[]=[];
  assert.equal((await readLaunchMorningBackground({rpc:async name=>{calls.push(name);return {data:row,error:null};}}))?.session,'2026-11-09');
  assert.deepEqual(calls,['vnext_launch_morning_public_v1']);
  assert.equal(await readLaunchMorningBackground({rpc:async()=>{throw Error('SYNTHETIC_PRIVATE');}}),null);
  await assert.rejects(publishLaunchMorningBackground({principal:'test-author',role:'author'}),/launch_morning_operator_required/u);
});

test('home displays latest stored morning and prior completed day alongside original ranking',()=>{
  const require=createRequire(import.meta.url);
  const {createElement}=require('react') as typeof import('react');
  const {renderToStaticMarkup}=require('react-dom/server') as typeof import('react-dom/server');
  const path=new URL('../../app/components/vnext/LaunchHome.tsx',import.meta.url);
  const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{fileName:path.pathname,compilerOptions:{target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const isolated={exports:{} as Record<string,unknown>};
  const component={__esModule:true,default:()=>null};
  vm.runInNewContext(js,{Intl,module:isolated,exports:isolated.exports,require:(name:string)=>{
    if(name==='@/lib/vnext/launch-morning-background'||name==='@/lib/vnext/launch-ranking-read')return {};
    if(name==='next/link'||name==='./LaunchTop10')return component;
    return require(name);
  }});
  const view=isolated.exports.LaunchHomeView as import('react').ComponentType<{read:object;morning:unknown}>;
  const read={availability:'not_published',snapshot:null,current:[]};
  const markup=renderToStaticMarkup(createElement(view,{read,morning:parseLaunchMorningBackground(row)}));
  for(const label of ['08:15 盤前市場背景','2026-11-09','2026-11-06','原榜單市場判斷','42,000.00','330.12'])
    assert.ok(markup.includes(label),label);
  assert.equal((markup.match(/<section\b/gu)||[]).length,2);
  assert.doesNotMatch(renderToStaticMarkup(createElement(view,{read,morning:null})),/盤前市場背景/u);
});

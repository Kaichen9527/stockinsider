import assert from 'node:assert/strict';
import test from 'node:test';
import {parseMopsSimpleForecastDetail,parseMopsSimpleForecastIndex,readMopsSimpleForecast} from './mops-simple-forecast-source.ts';

const scope={year:2026,symbol:'2412'};
const endpoint='https://mopsov.twse.com.tw/mops/web/ajax_t163sb10';
const locator='document.fm.step.value="3";document.fm.sstep.value="1";document.fm.SEQ_NO.value="0";document.fm.year.value="115";document.fm.DURS.value="1111";openWindow(this.form ,"");';
function reportIndex(entry:string){
 return `<form name="fm" action="/mops/web/ajax_t163sb10">
 <input name="co_id" value="2412"><input name="TYPEK" value="sii">
 <table><tr><td>完整式財務預測公告查詢</td></tr></table>
 <table><tr><td>簡式財務預測公告查詢</td></tr></table>
 <table><tr><th>第X次</th><th>預測類別</th><th>編製基礎</th><th>季別</th><th>公告日期</th><th>&nbsp;</th></tr>${entry}</table>
 </form>`;
}
const entry=`<tr><td>0</td><td>原編</td><td>合併</td><td>一、二、三、四</td><td>115/01/23</td><td><input type="button" onclick='${locator}'></td></tr>`;
const detail=`<script>throw new Error("no script may be evaluated")</script>
<table><tr><td class="reportName">簡式財務預測原編公告說明事項申報</td></tr>
<tr><td class="compName">合成工程資料</td></tr>
<tr><td class="reportCont">年度：115　　財測序號：0</td></tr></table>
<table><tr><th>1.財務預測型態</th><td>簡式</td></tr><tr><th>2.財務預測所屬年度</th><td>115</td></tr>
<tr><th>3.財務預測涵蓋期間</th><td>●第一季●第二季●第三季●第四季</td></tr>
<tr><th>6.財務預測公告日期</th><td>115/01/23</td></tr></table>
<table><tr><td>單位:新台幣仟元</td></tr></table>
<table><tr><th>&nbsp;</th>
${['第一季','第二季','第三季','第四季'].map(q=>`<th>${q}(註一)<br>○查核(核閱數)<br>○自結數<br>○預測數</th>`).join('')}<th>合計</th></tr>
<tr><th>營業收入</th><td>123,456</td><td>100,000</td><td>2</td><td>99</td><td>100,001</td></tr>
<tr><th>每股稅後盈餘</th><td>0</td><td>-0.5</td><td>1.2 ~ 1.5</td><td>0.7 ~ 2.2</td><td>1.1 ~ 3.4</td></tr></table>`;
const release=parseMopsSimpleForecastIndex(reportIndex(entry),scope)!;

test('original filing preserves each declared period and the independent signed published annual interval',()=>{
 const parsed=parseMopsSimpleForecastDetail(detail,scope,release);
 assert.equal(parsed.shareBasis,null);
 assert.equal(parsed.denominatorShares,null);
 assert.equal(parsed.classification,'issuer_disclosed_forecast');
 assert.deepEqual(parsed.quarters.map(q=>q.eps),[{kind:'point',value:0},{kind:'point',value:-0.5},{kind:'range',low:1.2,high:1.5},{kind:'range',low:0.7,high:2.2}]);
 assert.deepEqual(parsed.annual,{kind:'range',low:1.1,high:3.4});
 assert.deepEqual(parseMopsSimpleForecastDetail(detail.replace('1.1 ~ 3.4','-1.25 ~ -0.12'),scope,release).annual,{kind:'range',low:-1.25,high:-0.12});
});

test('today cannot fall back to the original when the list has multiple releases or ambiguous scope',()=>{
 assert.equal(parseMopsSimpleForecastIndex(reportIndex(''),scope),null);
 for(const invalid of [reportIndex(entry+entry),reportIndex(entry.replace('原編','修正')),reportIndex(entry.replace('SEQ_NO.value="0"','SEQ_NO.value="9"')),
  reportIndex(entry).replace('2412','2454'),reportIndex(entry).replace('115/01/23','115/02/30')])
  assert.throws(()=>parseMopsSimpleForecastIndex(invalid,scope),/vnext_mops_simple_forecast_/u);
});

test('detail fails closed on reordered quarters, missing EPS, collapsed/inverted intervals, and cross-file bindings',()=>{
 for(const invalid of [detail.replace('1.1 ~ 3.4','3.4 ~ 1.1'),detail.replace('1.1 ~ 3.4','3.4 ~'),detail.replace('1.1 ~ 3.4','—'),
  detail.replace('第一季(註一)','第二季(註一)'),detail.replace('每股稅後盈餘','每股其他收益'),detail.replace('115/01/23','115/01/24'),
  detail.replace('新台幣仟元','美元仟元'),detail.replace('財測序號：0','財測序號：1'),detail.replace('●第四季','○第四季')])
  assert.throws(()=>parseMopsSimpleForecastDetail(invalid,scope,release),/vnext_mops_simple_forecast_/u);
});

function response(body:string,url=endpoint,contentType='text/html; charset=UTF-8'){
 const result=new Response(body,{headers:{'content-type':contentType}});
 Object.defineProperty(result,'url',{value:url});
 return result;
}
test('read path makes two bounded public requests and keeps raw digests and acquired time separate from publication',async()=>{
 const requests:{url:string;init:RequestInit}[]=[];
 const transport:typeof fetch=async(url,init)=>{
  requests.push({url:String(url),init:init!});
  return response(requests.length===1?reportIndex(entry):detail);
 };
 const receipt=await readMopsSimpleForecast(scope,transport);
 assert.ok(receipt);
 assert.equal(receipt.publishedDate,'2026-01-23');
 assert.ok(receipt.knownAt>receipt.publishedDate);
 assert.match(receipt.detailReceipt.sha256,/^[a-f0-9]{64}$/u);
 assert.equal(receipt.detailReceipt.bytes,Buffer.byteLength(detail));
 assert.equal(receipt.original.detail,detail);
 assert.deepEqual(requests.map(r=>[r.url,r.init.redirect,String(r.init.method)]),[[endpoint,'error','POST'],[endpoint,'error','POST']]);
 const fields=new URLSearchParams(String(requests[1].init.body));
 assert.deepEqual(['co_id','year','SEQ_NO','DURS'].map(key=>fields.get(key)),['2412','115','0','1111']);
});

test('read path refuses changed origin or type, oversize and invalid identifiers with no second request',async()=>{
 for(const changed of [response(reportIndex(entry),'https://example.com'),response(reportIndex(entry),endpoint,'application/json'),response('x'.repeat(262145))]){
  let requests=0;
  await assert.rejects(()=>readMopsSimpleForecast(scope,async()=>{requests++;return changed;}),/vnext_mops_simple_forecast_/u);
  assert.equal(requests,1);
 }
 await assert.rejects(()=>readMopsSimpleForecast({...scope,symbol:'2412&year=116'},async()=>{throw Error('unexpected_io');}),/scope_invalid/u);
});

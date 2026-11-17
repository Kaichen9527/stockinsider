import type {LaunchOutcomeCohorts} from '@/lib/vnext/launch-outcome-cohorts';

type Ready=Extract<LaunchOutcomeCohorts,{status:'ready'}>;
type Cohort=Ready['cohorts'][number];
const tz=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short',hourCycle:'h23'});
const number=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2,signDisplay:'exceptZero'});
const pct=(value:number|null)=>value===null?'—':number.format(value)+'%';
type Row={label:string;values:[number,number]};
function CompareCounts({title,rows}:{title:string;rows:Row[]}){
  return <table className="mt-4 w-full text-left text-sm tabular-nums">
    <caption className="mb-2 text-left font-semibold">{title}</caption>
    <thead className="border-b border-slate-300 dark:border-slate-700"><tr>
      <th scope="col" className="pb-2">狀態</th><th scope="col" className="pb-2 text-right">首次上榜</th>
      <th scope="col" className="pb-2 text-right">連續上榜</th>
    </tr></thead>
    <tbody>{rows.map(row=><tr key={row.label} className="border-b border-slate-200 dark:border-slate-800">
      <th scope="row" className="py-2 pr-1 font-medium">{row.label}</th>
      <td className="text-right">{row.values[0]}</td><td className="pl-1 text-right">{row.values[1]}</td>
    </tr>)}</tbody>
  </table>;
}
function barriers(groups:[Cohort,Cohort],track:'research'|'execution'):Row[]{
  const labels=[['upFirst','先觸及 +20%'],['downFirst','先觸及 −15%'],['orderUnknown','觸價先後不明'],
    ['notHit','期限內未觸及'],['pending','尚未到期'],['dataGap','資料不足'],['waitingObservation','等待觀測']] as const;
  return labels.filter(row=>track==='research'||row[0]!=='waitingObservation').map(([key,label])=>({
    label,values:[groups[0][track].barrier20[key],groups[1][track].barrier20[key]]}));
}
function HorizonRows({groups,track}:{groups:[Cohort,Cohort];track:'research'|'execution'}){
  return <div className="mt-4 space-y-3">{groups[0][track].horizons.map((first,index)=>{
    const repeat=groups[1][track].horizons[index];
    return <section aria-label={first.days+' 交易日'} key={first.days} className="rounded-lg border border-slate-300 p-3 dark:border-slate-700">
      <h3 className="font-semibold">{first.days} 個交易日{first.days===60?' · 主要追蹤':''}</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm tabular-nums">
      {[first,repeat].map((row,i)=><div key={i}>
        <p className="font-medium">{i===0?'首次上榜':'連續上榜'}</p>
        <p>有報酬 {row.ready} 筆 · 未到期 {row.pending} 筆</p>
        <p>資料不足 {row.dataGap} 筆{track==='research'?' · 等待觀測 '+row.waitingObservation+' 筆':''}</p>
        <p className="mt-1">{track==='execution'?'平均扣除成本報酬':'平均價格變動'} {pct(row.meanReturnPct)}</p>
        <p>{row.withBenchmark===0?'同市場超額 —':`平均同市場超額 ${number.format(row.meanExcessPct!)} 個百分點`} · {row.withBenchmark} 筆</p>
      </div>)}
      </div>
    </section>;
  })}</div>;
}
export default function LaunchPerformance({summary}:{summary:LaunchOutcomeCohorts}){
  if(summary.status==='unavailable')return <p role="status">成效統計暫時無法讀取。</p>;
  const {fromSession,throughSession,observedThrough,cohorts}=summary;
  const [first,repeat]=cohorts;
  if(first.signals+repeat.signals===0)return <p role="status">目前沒有已納入成效追蹤的上榜紀錄。</p>;
  const openingRows:Row[]=[
    {label:'模擬成交',values:[first.opening.filled,repeat.opening.filled]},
    {label:'無法成交',values:[first.opening.unfillable,repeat.opening.unfillable]},
    {label:'等待下一個交易日',values:[first.opening.pending,repeat.opening.pending]},
    {label:'開盤證據不足',values:[first.opening.evidenceGap,repeat.opening.evidenceGap]},
    {label:'等待觀測',values:[first.opening.waitingObservation,repeat.opening.waitingObservation]},
  ];
  return <>
    <p className="text-sm">發榜日範圍 <time dateTime={fromSession}>{fromSession}</time> 至 <time dateTime={throughSession}>{throughSession}</time>
      {observedThrough&&<> · 最新觀測 <time dateTime={observedThrough}>{tz.format(new Date(observedThrough))}</time></>}</p>
    <p className="text-sm">同一檔股票連續上榜時，每個榜單保留一筆紀錄。</p>
    <CompareCounts title="上榜樣本" rows={[{label:'已發布訊號',values:[first.signals,repeat.signals]},
      {label:'已有追蹤結果',values:[first.observed,repeat.observed]}]}/>
    <section aria-label="發榜日收盤研究">
      <h2 className="text-lg font-semibold">發榜日收盤研究</h2>
      <CompareCounts title="20 日門檻" rows={barriers(cohorts,'research')}/>
      <HorizonRows groups={cohorts} track="research"/>
    </section>
    <section aria-label="次一交易日開盤模擬">
      <h2 className="text-lg font-semibold">次一交易日開盤模擬</h2>
      <CompareCounts title="開盤結果" rows={openingRows}/>
      <CompareCounts title="已模擬成交樣本的 20 日門檻（扣除成本）" rows={barriers(cohorts,'execution')}/>
      <HorizonRows groups={cohorts} track="execution"/>
    </section>
  </>;
}

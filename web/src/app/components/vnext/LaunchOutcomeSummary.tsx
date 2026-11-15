import type {PublicLaunchOutcome} from '@/lib/vnext/launch-outcome-public';

type Ready=Extract<PublicLaunchOutcome,{state:'ready'}>;
type Horizon=Ready['research']['horizons'][number];
type Barrier=Ready['research']['barrier20'];

const timeFormat=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short',hourCycle:'h23'});
const percentage=new Intl.NumberFormat('zh-TW',{style:'percent',maximumFractionDigits:2,signDisplay:'exceptZero'});
const barrierLabels:Record<Barrier['state'],string>={
  up_first:'先觸及 +20%',down_first:'先觸及 −15%',order_unknown:'同日觸及上下界，先後不明',
  price_data_gap:'行情資料不足',calendar_gap:'交易日資料不足',pending:'尚未到期',not_hit:'20 個交易日內未觸及上下界',
};
const stateLabels:Record<Exclude<Horizon['state'],'ready'>,string>={pending:'尚未到期',price_data_gap:'行情資料不足',calendar_gap:'交易日資料不足'};
const executionLabels:Record<Ready['execution']['status'],string>={pending:'等待下一個交易日',opening_evidence_gap:'開盤證據不足',
  unfillable:'無法成交',modeled_fill:'依開盤價模擬成交'};
const noFill:Record<NonNullable<Ready['execution']['reason']>,string>={suspended:'開盤時停牌',one_price_upper_limit:'一字鎖漲停',no_executable_open:'開盤無可成交價'};
const pendingText:Record<Exclude<PublicLaunchOutcome['state'],'ready'>,string>={not_started:'這次上榜尚未納入成效追蹤。',
  awaiting_observation:'等待下一個交易日的官方資料。',unavailable:'成效資料暫時無法讀取。'};

function BarrierLabel({item}:{item:Barrier}){
  return <>{barrierLabels[item.state]}{item.session&&<> · <time dateTime={item.session}>{item.session}</time></>}</>;
}

const points=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2,signDisplay:'exceptZero'});
function Excess({value}:{value:number|null}){
  return <span className="block text-xs font-normal text-slate-600 dark:text-slate-400">
    {value===null?'大盤資料不足':`較同市場 ${points.format(value)} 個百分點`}
  </span>;
}

function MarkTable({rows,net}:{rows:Horizon[];net:boolean}){
  return <table className="mt-3 w-full text-left text-sm">
    <thead><tr className="border-b border-slate-300 dark:border-slate-700">
      <th scope="col" className="pb-2">交易日</th>
      <th scope="col" className="pb-2 text-right">{net?'成本前':'價格變動'}</th>
      {net&&<th scope="col" className="pb-2 text-right">扣除成本</th>}
    </tr></thead>
    <tbody>{rows.map(row=><tr className={row.horizon===60?'border-b border-slate-200 font-semibold dark:border-slate-700':'border-b border-slate-200 dark:border-slate-700'} key={row.horizon}>
      <th scope="row" className="py-2 font-medium">{row.horizon} 日{row.terminalSession&&<time dateTime={row.terminalSession} className="block text-xs font-normal text-slate-600 dark:text-slate-400">{row.terminalSession}</time>}</th>
      {row.state==='ready'?<><td className="py-2 text-right tabular-nums">{row.grossReturnPct===null?'資料不足':percentage.format(row.grossReturnPct/100)}<Excess value={row.marketExcessPct}/></td>
        {net&&<td className="py-2 text-right tabular-nums">{row.netReturnPct===null?'資料不足':percentage.format(row.netReturnPct/100)}<Excess value={row.netMarketExcessPct}/></td>}</>
        :<td colSpan={net?2:1} className="py-2 text-right text-slate-600 dark:text-slate-400">{stateLabels[row.state]}</td>}
    </tr>)}</tbody>
  </table>;
}

export default function LaunchOutcomeSummary({outcome}:{outcome:PublicLaunchOutcome}){
  return <section aria-labelledby="launch-outcome-heading" className="rounded-xl border border-slate-300 p-4 dark:border-slate-700">
    <h2 id="launch-outcome-heading" className="font-semibold">上榜後成效</h2>
    {outcome.state!=='ready'?<p className="mt-2 text-sm">{pendingText[outcome.state]}</p>:<>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {outcome.firstRankingRunId===outcome.rankingRunId?'首次上榜':'連續上榜'} · 觀測至 <time dateTime={outcome.asOf}>{timeFormat.format(new Date(outcome.asOf))}</time>
      </p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="font-semibold">發榜日收盤追蹤</h3>
          <p className="mt-1 text-sm">20 日訊號　<BarrierLabel item={outcome.research.barrier20}/></p>
          <MarkTable rows={outcome.research.horizons} net={false}/>
        </div>
        <div>
          <h3 className="font-semibold">次一交易日開盤模擬</h3>
          <p className="mt-1 text-sm">{executionLabels[outcome.execution.status]}{outcome.execution.reason&&<> · {noFill[outcome.execution.reason]}</>}
            {outcome.execution.nextSession&&<> · <time dateTime={outcome.execution.nextSession}>{outcome.execution.nextSession}</time></>}</p>
          {outcome.execution.grossBarrier20&&outcome.execution.netBarrier20&&<>
            <p className="mt-1 text-sm">20 日訊號成本前　<BarrierLabel item={outcome.execution.grossBarrier20}/></p>
            <p className="mt-1 text-sm">20 日訊號扣除成本　<BarrierLabel item={outcome.execution.netBarrier20}/></p>
            <MarkTable rows={outcome.execution.horizons} net/>
          </>}
          <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            模擬成本為買賣各 {outcome.costs.buyCommissionPpm/10000}% 手續費、賣出稅 {outcome.costs.sellTaxPpm/10000}%，每邊滑價 {outcome.costs.slippagePerSidePpm/10000}%。
          </p>
        </div>
      </div>
    </>}
  </section>;
}

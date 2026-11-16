import Link from 'next/link';
import {launchCandidateQuery,readLaunchCandidateCatalog,launchPoolIndustryLabels,type LaunchCandidateQuery, type launchCandidateFixturePage} from '@/lib/vnext/launch-candidate-catalog';
type Projection=ReturnType<typeof launchCandidateFixturePage>|Awaited<ReturnType<typeof readLaunchCandidateCatalog>>;
const labels={recorded_active_epoch:'已記錄的研究池期間',recorded_exited_epoch:'已記錄的離池期間',admission_history_unknown:'入池歷史未知',snapshot_waiting:'快照當時等待',snapshot_eligible:'快照當時符合條件',absent_from_successor:'本版未出現'};
/** Present only the closed projection union. No raw/source/rights lookup here. */
export function LaunchCandidateCatalogView({query,data}:{query:LaunchCandidateQuery;data:Projection}){
 const catalogId='catalogId' in data?data.catalogId:query.catalogId;
 const pool='scope' in data&&data.scope==='saved_adjacent_launch_pool_snapshots';
 const href=(id:string|null,cursor?:string)=>{const p=new URLSearchParams();if(id)p.set('catalogId',id);p.set('limit',String(query.limit));
  for(const [key,value] of Object.entries(query.filters))if(value)p.set(key,value);if(cursor)p.set('cursor',cursor);return `/candidates?${p.toString()}`;};
 return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8" data-testid="launch-candidate-catalog">
  <Link href="/" prefetch={false} className="underline">返回市場與榜單</Link><h1 className="text-2xl font-semibold">來源先行候選紀錄</h1>
  {pool?<p>這裡顯示已發布榜單的研究池紀錄。產業分類取自各版本截止時已知的資料，未確認的分類會留空。</p>
   :<p>來源提及與入池紀錄分開呈現。沒有已記錄的入池事件只代表歷史未知，無法證明從未入池。來源與入池歷史仍不完整，瀏覽不會啟動研究。</p>}
  {'scope' in data&&data.scope==='synthetic_projection_only'&&<p role="status">受控合成投影示例；不是實際來源目錄、授權或正式研究證據。</p>}
  <form method="get" className="flex flex-wrap items-end gap-3">
   {catalogId&&<input type="hidden" name="catalogId" value={catalogId}/>}<input type="hidden" name="limit" value={query.limit}/>
   <label className="grid gap-1">{pool?'快照日期（台北）':'原始提及日期（台北）'}<input type="date" name="date" defaultValue={query.filters.date||''}/></label>
   <label className="grid gap-1">來源<input name="source" maxLength={40} defaultValue={query.filters.source||''}/></label>
   {pool?<label className="grid gap-1">快照產業<select name="industry" defaultValue={Object.keys(launchPoolIndustryLabels)
      .find(code=>code===query.filters.industry||launchPoolIndustryLabels[code]===query.filters.industry)||''}>
     <option value="">全部</option>{Object.entries(launchPoolIndustryLabels).map(([code,label])=><option key={code} value={code}>{label}</option>)}
    </select></label>:<label className="grid gap-1">原快照產業代碼<input name="industry" maxLength={60} defaultValue={query.filters.industry||''}/></label>}
   <label className="grid gap-1">已記錄狀態<select name="status" defaultValue={query.filters.status||''}><option value="">全部</option>{Object.entries(labels).filter(([key])=>pool===['snapshot_waiting','snapshot_eligible','absent_from_successor'].includes(key)).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <button type="submit">篩選</button>
  </form>
  {data.availability==='producer_unavailable'?<p role="status">目前無法讀取已發布的新版研究池快照。這不代表沒有候選。</p>
   :data.availability==='filtered_projection_unavailable'?<p role="status">此版本目前無法安全提供篩選結果；不以其他候選補齊。</p>
   :<><p>固定目錄時間：<time>{data.cutoff}</time></p><p className="break-all text-sm">目錄版本：{data.catalogId}</p>
    {pool&&<nav className="flex flex-wrap gap-4" aria-label="已保存的研究池版本">
     {data.previousSnapshot&&<Link href={href(data.previousSnapshot.id)} prefetch={false} className="underline">較早版本</Link>}
     {data.nextSnapshot&&<Link href={href(data.nextSnapshot.id)} prefetch={false} className="underline">較新版本</Link>}
    </nav>}
    {pool ? (!data.rows.length?<p>這個快照沒有符合條件的研究池紀錄。</p>:<div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>股票</th><th>產業</th><th>快照狀態</th><th>最近觀察</th></tr></thead><tbody>
     {data.rows.map(row=><tr key={row.position}><td>{row.symbol}</td><td>{row.industrySnapshot?.label||'分類待確認'}</td><td>{labels[row.state]}{row.state==='absent_from_successor'&&<p className="text-sm">確切離池時間與原因未保存</p>}</td><td><time dateTime={row.lastSeenAt}>{row.lastSeenAt}</time></td></tr>)}
     </tbody></table></div>) : !data.rows.length?<p>這個有限投影沒有符合條件的列；不代表完整來源或入池歷史。</p>:<div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>位置</th><th>股票</th><th>來源</th><th>原始提及</th><th>原快照產業</th><th>已記錄狀態</th></tr></thead>
     <tbody>{data.rows.map(row=><tr key={row.position}>{'symbol' in row?<><td>{row.position}</td><td>{row.symbol}</td><td>{row.source}</td><td><time dateTime={row.eventAt}>{row.eventAt}</time></td><td>{row.industrySnapshot?.label||'產業缺口'}</td><td>{labels[row.state]}{row.admission.kind==='admission_history_unknown'&&<p>未觀察到入池事件；歷史未知</p>}</td></>:<><td>{row.position}</td><td colSpan={5}>此位置的公開資訊已撤回</td></>}</tr>)}</tbody></table></div>}
    {data.nextCursor&&<Link href={href(catalogId,data.nextCursor)} prefetch={false} className="underline">下一頁</Link>}
   </>}
  <p className="text-sm">來源完整覆蓋：未證明；入池完整覆蓋：未證明；啟用前歷史：無法提供。歷史觀察不授予當前進場資格。</p>
 </main>;
}
export default async function LaunchCandidateCatalog({searchParams,enabled}:{searchParams:Record<string,string|string[]|undefined>;enabled:boolean}){
 if(!enabled)return <main data-testid="launch-candidate-disabled"><h1>來源先行候選紀錄</h1><p>新候選目錄尚未啟用；不改讀舊快照補齊。</p></main>;
 try{
  const params=new URLSearchParams();for(const [key,value] of Object.entries(searchParams)){if(Array.isArray(value))throw Error('query');if(value!==undefined)params.set(key,value);}
  const query=launchCandidateQuery(params);
  const data=await readLaunchCandidateCatalog(query);
  return <LaunchCandidateCatalogView query={query} data={data}/>;
 }catch{return <main data-testid="launch-candidate-invalid"><p role="alert">候選篩選或分頁參數不一致，請重新選擇。</p></main>;}
}

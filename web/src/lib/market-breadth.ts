/** Price-presence arithmetic only. Roster/calendar/source/CA authority must be
 * supplied by the real producer; these raw observations grant none of it. */
export function breadthForRoster(history: Map<string, Array<{ date:string;close:number }>>, roster: Set<string>,
  signalSession: string, completedWindow: readonly string[]) {
  const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  if(!date(signalSession)||completedWindow.length>30||new Set(completedWindow).size!==completedWindow.length
    || completedWindow.some((day,index)=>!date(day)||day>signalSession||index>0&&day<=completedWindow[index-1])
    || completedWindow.at(-1)!==signalSession)throw Error('breadth_window_invalid');
  const allowed=new Set(completedWindow),strictDays=completedWindow.slice(-20);
  let numerator=0,observed=0,strictLast20Present=0,missingSignalClose=0,shortHistory=0,conflictingSessionRows=0,excludedRows=0;
  for(const symbol of roster){
    const byDate=new Map<string,number>();let conflict=false;
    for(const row of history.get(symbol)||[]){
      if(!date(row.date)||!allowed.has(row.date)){excludedRows++;continue;}
      if(byDate.has(row.date)&&!Object.is(byDate.get(row.date),row.close)){conflict=true;continue;}
      byDate.set(row.date,row.close);
    }
    if(conflict){conflictingSessionRows++;continue;}
    const rows=[...byDate].filter(([,close])=>typeof close==='number'&&Number.isFinite(close)&&close>0)
      .sort(([a],[b])=>a.localeCompare(b));
    const signal=rows.find(([day])=>day===signalSession);
    if(!signal){missingSignalClose++;continue;}
    if(rows.length<20){shortHistory++;continue;}
    const selected=rows.slice(-20);observed++;
    if(strictDays.length===20&&strictDays.every(day=>rows.some(([found])=>found===day)))strictLast20Present++;
    const average=selected.reduce((sum,[,close])=>sum+close,0)/20;
    if(Number.isFinite(average)&&signal[1]>average)numerator++;
  }
  return Object.freeze({numerator,observed,eligible:roster.size,diagnostics:Object.freeze({
    schemaVersion:'market-breadth-price-presence-v1',signalSession,windowSessions:completedWindow.length,strictLast20Present,
    signalPlus20Of30:observed,missingSignalClose,shortHistory,conflictingSessionRows,excludedRows,
    coveragePct:roster.size?observed/roster.size*100:0,priceBasis:'raw_unadjusted_observations',
    caComparability:null,sourceAuthority:false,marketAuthority:false,gaps:Object.freeze(['breadth_ca_comparability_not_proven'])})});
}

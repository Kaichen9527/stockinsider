import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {calendarFor} from '/Users/kaerchen/.cache/stockinsider-workspaces/calendar-inbox-release-review-oct11/web/src/lib/entry-plan-authority-backfill.ts';
const input=JSON.parse(readFileSync('/tmp/stockinsider-pr370-production-calendar-oct11.json','utf8'));
const result=[];
for(const market of ['TWSE','TPEX']) {
 const rows=input.rows.filter(r=>r.market===market); const requests=[];
 const client={from(table){assert.equal(table,'tw_trading_sessions_v3');let start,end; const q={select(){return q},eq(){return q},lte(){return q},order(){return q},range(a,b){start=a;end=b;requests.push([a,b]);return q},abortSignal(){return q},then(resolve){return Promise.resolve(resolve({data:rows.slice(start,end+1),error:null}))}};return q}};
 const sessions=await calendarFor(client,market,input.cutoff);
 const heads=[...new Map(rows.slice(0,3000).map(r=>[r.session_id,rows.find(x=>x.session_id===r.session_id)])).values()];
 assert.equal(sessions.length,240);assert.equal(sessions.at(-1).session,'2026-10-08');
 result.push({market,rawRows:rows.length,oldPrefixDistinctDays:heads.length,oldPrefixCompleted:heads.filter(r=>r.status==='completed').length,newCompletedDays:sessions.length,first:sessions[0].session,last:sessions.at(-1).session,pages:requests.length});
}
console.log(JSON.stringify({scope:'read-only production rows replay; in-memory paging adapter; no database writes or HTTP acquisition',cutoff:input.cutoff,result},null,2));

type Row=Record<string,unknown>; type Exchange='TWSE'|'TPEX'; type SupabaseClient=any; type FrozenSession=any; const day=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s); function fail(s:string):never{throw Error(s)}
async function calendarFor(client: SupabaseClient, exchange: Exchange, cutoff: string) {
  const rows: Row[] = [];
  for (let offset = 0; offset < 3000; offset += 500) {
    const result = await client.from('tw_trading_sessions_v3')
      .select('session_authority_id,session_id,market,status,provider,source_timestamp,collected_at,recorded_at,close_at')
      .eq('market', exchange).lte('session_id', cutoff.slice(0, 10))
      .lte('source_timestamp', cutoff).lte('collected_at', cutoff).lte('recorded_at', cutoff)
      .order('session_id', { ascending: false }).order('recorded_at', { ascending: false }).range(offset, offset + 499);
    if (result.error || !Array.isArray(result.data)) fail('entry_plan_calendar_read_failed');
    rows.push(...result.data as Row[]);
    if (result.data.length < 500) break;
  }
  const heads = new Map<string, Row>();
  for (const row of rows) if (day(row.session_id) && !heads.has(String(row.session_id))) heads.set(String(row.session_id), row);
  const selected = [...heads.values()].filter((row) => row.status === 'completed' && row.provider === exchange.toLowerCase()
    && Date.parse(String(row.close_at)) <= Date.parse(cutoff)).slice(0, 240).reverse();
  if (selected.length !== 240) fail(`entry_plan_calendar_240_missing:${exchange}`);
  return selected.map((row): FrozenSession => ({ session: String(row.session_id),
    sessionAuthorityId: String(row.session_authority_id), market: exchange, status: 'completed' }));
}

export {calendarFor};

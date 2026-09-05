export function aggregateSourceRuns24h(rows: Array<Record<string, unknown>>) {
  const aggregates = new Map<string, { runs: number; fetched: number; matched: number; newCount: number; duplicate: number; written: number }>();
  for (const row of rows) {
    const connector = String(row.connector || '');
    if (!connector) continue;
    const current = aggregates.get(connector) || { runs: 0, fetched: 0, matched: 0, newCount: 0, duplicate: 0, written: 0 };
    current.runs += 1;
    current.fetched += Number(row.fetched || 0);
    current.matched += Number(row.matched || 0);
    current.newCount += Number(row.new_count || 0);
    current.duplicate += Number(row.duplicate || 0);
    current.written += Number(row.written || 0);
    aggregates.set(connector, current);
  }
  return aggregates;
}

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDotEnv(filepath) {
  if (!fs.existsSync(filepath)) return;
  const content = fs.readFileSync(filepath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] != null) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function getConnectionConfig() {
  loadDotEnv(path.join(process.cwd(), '.env'));
  loadDotEnv(path.join(process.cwd(), '.env.local'));
  if (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) {
    return {
      connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    };
  }
  const host = process.env.SUPABASE_DB_HOST;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!host || !password) throw new Error('missing_supabase_db_credentials');
  return {
    host,
    port: Number(process.env.SUPABASE_DB_PORT || 5432),
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password,
    database: process.env.SUPABASE_DB_DATABASE || 'postgres',
    ssl: { rejectUnauthorized: false },
  };
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function bytesToMb(value) {
  return Math.round((Number(value || 0) / 1024 / 1024) * 100) / 100;
}

async function maybeQuery(client, sql, params = []) {
  try {
    const result = await client.query(sql, params);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error: error.message };
  }
}

function cacheHitRate(row) {
  const hit = Number(row?.blks_hit || 0);
  const read = Number(row?.blks_read || 0);
  const total = hit + read;
  return total > 0 ? Math.round((hit / total) * 10000) / 100 : null;
}

async function main() {
  const strict = hasFlag('--strict');
  const reportsDir = path.join(process.cwd(), '.agent', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const client = new Client(getConnectionConfig());
  await client.connect();

  const databaseStats = await maybeQuery(client, `
    select
      datname,
      blks_read,
      blks_hit,
      temp_files,
      temp_bytes,
      deadlocks,
      blk_read_time,
      blk_write_time
    from pg_stat_database
    where datname = current_database()
  `);

  const tableStats = await maybeQuery(client, `
    select
      s.relname as table_name,
      pg_total_relation_size(s.relid) as total_bytes,
      pg_relation_size(s.relid) as table_bytes,
      pg_indexes_size(s.relid) as index_bytes,
      s.n_live_tup::bigint as estimated_live_rows,
      s.n_dead_tup::bigint as estimated_dead_rows,
      s.seq_scan::bigint as seq_scan,
      s.seq_tup_read::bigint as seq_tup_read,
      s.idx_scan::bigint as idx_scan,
      s.last_autovacuum,
      s.last_autoanalyze,
      io.heap_blks_read::bigint as heap_blks_read,
      io.heap_blks_hit::bigint as heap_blks_hit,
      io.idx_blks_read::bigint as idx_blks_read,
      io.idx_blks_hit::bigint as idx_blks_hit,
      io.toast_blks_read::bigint as toast_blks_read,
      io.toast_blks_hit::bigint as toast_blks_hit
    from pg_stat_user_tables s
    join pg_statio_user_tables io on io.relid = s.relid
    order by (io.heap_blks_read + io.idx_blks_read + io.toast_blks_read) desc
    limit 40
  `);

  const statementStats = await maybeQuery(client, `
    select
      calls,
      rows,
      total_exec_time,
      mean_exec_time,
      shared_blks_read,
      shared_blks_hit,
      temp_blks_read,
      temp_blks_written,
      left(regexp_replace(query, '\\s+', ' ', 'g'), 500) as query
    from pg_stat_statements
    order by (shared_blks_read + temp_blks_read + temp_blks_written) desc
    limit 25
  `);

  const unusedIndexes = await maybeQuery(client, `
    select
      relname as table_name,
      indexrelname as index_name,
      idx_scan,
      pg_relation_size(indexrelid) as index_bytes
    from pg_stat_user_indexes
    where idx_scan = 0
      and schemaname = 'public'
    order by pg_relation_size(indexrelid) desc
    limit 25
  `);

  await client.end();

  const databaseRow = databaseStats.rows[0] || {};
  const dbCacheHitRate = cacheHitRate(databaseRow);
  const issues = [];
  if (databaseStats.error) issues.push(`database_stats_unavailable:${databaseStats.error}`);
  if (tableStats.error) issues.push(`table_stats_unavailable:${tableStats.error}`);
  if (statementStats.error) issues.push(`pg_stat_statements_unavailable:${statementStats.error}`);
  if (dbCacheHitRate != null && dbCacheHitRate < 98) issues.push(`low_database_cache_hit_rate:${dbCacheHitRate}%`);

  const topTables = tableStats.rows.map((row) => {
    const live = Number(row.estimated_live_rows || 0);
    const dead = Number(row.estimated_dead_rows || 0);
    const deadTuplePct = live + dead > 0 ? Math.round((dead / (live + dead)) * 10000) / 100 : 0;
    const tableCacheHitRate = cacheHitRate({ blks_hit: row.heap_blks_hit, blks_read: row.heap_blks_read });
    const seqScanRisk =
      Number(row.seq_tup_read || 0) > 100000 && Number(row.seq_scan || 0) > Math.max(20, Number(row.idx_scan || 0));
    if (deadTuplePct > 25 && live + dead > 10000) issues.push(`${row.table_name}:dead_tuple_pct_${deadTuplePct}`);
    if (seqScanRisk) issues.push(`${row.table_name}:seq_scan_risk`);
    return {
      tableName: row.table_name,
      totalMb: bytesToMb(row.total_bytes),
      tableMb: bytesToMb(row.table_bytes),
      indexMb: bytesToMb(row.index_bytes),
      estimatedLiveRows: live,
      estimatedDeadRows: dead,
      deadTuplePct,
      seqScan: Number(row.seq_scan || 0),
      seqTupRead: Number(row.seq_tup_read || 0),
      idxScan: Number(row.idx_scan || 0),
      heapReadBlocks: Number(row.heap_blks_read || 0),
      heapHitBlocks: Number(row.heap_blks_hit || 0),
      indexReadBlocks: Number(row.idx_blks_read || 0),
      indexHitBlocks: Number(row.idx_blks_hit || 0),
      tableCacheHitRate,
      lastAutoVacuum: row.last_autovacuum,
      lastAutoAnalyze: row.last_autoanalyze,
      seqScanRisk,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    strict,
    passed: strict ? issues.filter((issue) => !issue.startsWith('pg_stat_statements_unavailable')).length === 0 : true,
    issues,
    database: {
      cacheHitRate: dbCacheHitRate,
      blocksRead: Number(databaseRow.blks_read || 0),
      blocksHit: Number(databaseRow.blks_hit || 0),
      tempFiles: Number(databaseRow.temp_files || 0),
      tempMb: bytesToMb(databaseRow.temp_bytes),
      blockReadTimeMs: Number(databaseRow.blk_read_time || 0),
      blockWriteTimeMs: Number(databaseRow.blk_write_time || 0),
    },
    topIoTables: topTables,
    topIoStatements: statementStats.rows.map((row) => ({
      calls: Number(row.calls || 0),
      rows: Number(row.rows || 0),
      totalExecMs: Math.round(Number(row.total_exec_time || 0) * 100) / 100,
      meanExecMs: Math.round(Number(row.mean_exec_time || 0) * 100) / 100,
      sharedBlocksRead: Number(row.shared_blks_read || 0),
      sharedBlocksHit: Number(row.shared_blks_hit || 0),
      tempBlocksRead: Number(row.temp_blks_read || 0),
      tempBlocksWritten: Number(row.temp_blks_written || 0),
      query: row.query,
    })),
    unusedLargeIndexes: unusedIndexes.rows.map((row) => ({
      tableName: row.table_name,
      indexName: row.index_name,
      indexMb: bytesToMb(row.index_bytes),
      idxScan: Number(row.idx_scan || 0),
    })),
    notes: [
      'pg_stat_statements may be unavailable on Supabase Free/limited roles; table and database stats still help identify I/O risk.',
      'High seq_scan with high seq_tup_read means queries may be bypassing useful indexes.',
      'High dead tuple percentage means retention cleanup should be followed by VACUUM ANALYZE.',
    ],
  };

  const reportPath = path.join(reportsDir, `supabase-io-hotspots-${report.generatedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Supabase I/O hotspot audit: ${report.passed ? 'pass' : 'risk detected'}`);
  console.log(`Database cache hit: ${dbCacheHitRate == null ? 'unknown' : `${dbCacheHitRate}%`}`);
  for (const table of topTables.slice(0, 10)) {
    console.log(
      `- ${table.tableName}: readBlocks=${table.heapReadBlocks + table.indexReadBlocks}, seqScan=${table.seqScan}, dead=${table.deadTuplePct}%, size=${table.totalMb}MB`,
    );
  }
  console.log(`Report: ${reportPath}`);
  if (!report.passed) process.exit(1);
}

main().catch((error) => {
  console.error(`Supabase I/O hotspot audit failed: ${error.message}`);
  process.exit(1);
});

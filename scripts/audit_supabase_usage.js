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
  if (!host || !password) {
    throw new Error('missing_supabase_db_credentials');
  }
  return {
    host,
    port: Number(process.env.SUPABASE_DB_PORT || 5432),
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password,
    database: process.env.SUPABASE_DB_DATABASE || 'postgres',
    ssl: { rejectUnauthorized: false },
  };
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

async function main() {
  const reportsDir = path.join(process.cwd(), '.agent', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const client = new Client(getConnectionConfig());
  await client.connect();

  const database = await client.query(`
    select
      current_database() as database_name,
      pg_database_size(current_database()) as database_bytes
  `);

  const tables = await client.query(`
    select
      schemaname,
      relname as table_name,
      pg_total_relation_size(format('%I.%I', schemaname, relname)) as total_bytes,
      pg_relation_size(format('%I.%I', schemaname, relname)) as table_bytes,
      pg_indexes_size(format('%I.%I', schemaname, relname)) as index_bytes,
      n_live_tup::bigint as estimated_live_rows,
      n_dead_tup::bigint as estimated_dead_rows,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze
    from pg_stat_user_tables
    order by pg_total_relation_size(format('%I.%I', schemaname, relname)) desc
    limit 40
  `);

  const storage = await maybeQuery(client, `
    select
      b.name as bucket_name,
      count(o.id)::bigint as object_count,
      coalesce(sum((o.metadata->>'size')::bigint), 0) as total_bytes
    from storage.buckets b
    left join storage.objects o on o.bucket_id = b.id
    group by b.name
    order by total_bytes desc
  `);

  const highChurnTables = [
    ['source_audits', 'created_at'],
    ['source_raw_documents', 'collected_at'],
    ['agent_findings', 'created_at'],
    ['connector_runs', 'started_at'],
    ['research_reports', 'created_at'],
    ['worker_logs', 'created_at'],
    ['worker_job_runs', 'started_at'],
    ['runtime_artifacts', 'created_at'],
  ];

  const retention = [];
  for (const [tableName, dateColumn] of highChurnTables) {
    const exists = await maybeQuery(client, `
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name = $2
      limit 1
    `, [tableName, dateColumn]);
    if (!exists.rows.length) {
      retention.push({ tableName, dateColumn, available: false });
      continue;
    }
    const counts = await maybeQuery(client, `
      select
        count(*)::bigint as total_rows,
        count(*) filter (where ${dateColumn} < now() - interval '30 days')::bigint as rows_older_30d,
        count(*) filter (where ${dateColumn} < now() - interval '60 days')::bigint as rows_older_60d,
        count(*) filter (where ${dateColumn} < now() - interval '90 days')::bigint as rows_older_90d,
        min(${dateColumn}) as oldest_at,
        max(${dateColumn}) as newest_at
      from public.${tableName}
    `);
    retention.push({ tableName, dateColumn, available: true, ...(counts.rows[0] || {}) });
  }

  await client.end();

  const report = {
    generatedAt: new Date().toISOString(),
    database: {
      name: database.rows[0].database_name,
      sizeMb: bytesToMb(database.rows[0].database_bytes),
      rawBytes: Number(database.rows[0].database_bytes),
    },
    topTables: tables.rows.map((row) => ({
      schema: row.schemaname,
      tableName: row.table_name,
      totalMb: bytesToMb(row.total_bytes),
      tableMb: bytesToMb(row.table_bytes),
      indexMb: bytesToMb(row.index_bytes),
      estimatedLiveRows: Number(row.estimated_live_rows || 0),
      estimatedDeadRows: Number(row.estimated_dead_rows || 0),
      lastVacuum: row.last_vacuum,
      lastAutoVacuum: row.last_autovacuum,
      lastAnalyze: row.last_analyze,
      lastAutoAnalyze: row.last_autoanalyze,
    })),
    storageBuckets: storage.error
      ? { available: false, error: storage.error }
      : {
          available: true,
          buckets: storage.rows.map((row) => ({
            bucketName: row.bucket_name,
            objectCount: Number(row.object_count || 0),
            totalMb: bytesToMb(row.total_bytes),
          })),
        },
    retentionCandidates: retention,
    interpretation: [
      'If Supabase dashboard shows usage far above database size, inspect Storage and Unified Egress in the dashboard before deleting DB rows.',
      'Tables with high estimatedDeadRows may need VACUUM ANALYZE after retention cleanup; VACUUM FULL/REINDEX should be scheduled with care.',
      'Use scripts/supabase_retention_cleanup.js in dry-run mode first; it archives selected rows before any delete when --execute is used.',
    ],
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `supabase-usage-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Supabase database size: ${report.database.sizeMb} MB`);
  console.log('Top tables:');
  for (const table of report.topTables.slice(0, 10)) {
    console.log(`- ${table.tableName}: ${table.totalMb} MB (${table.estimatedLiveRows} live rows, ${table.estimatedDeadRows} dead rows)`);
  }
  if (report.storageBuckets.available) {
    console.log('Storage buckets:');
    for (const bucket of report.storageBuckets.buckets.slice(0, 10)) {
      console.log(`- ${bucket.bucketName}: ${bucket.totalMb} MB (${bucket.objectCount} objects)`);
    }
  } else {
    console.log(`Storage bucket query unavailable: ${report.storageBuckets.error}`);
  }
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(`Supabase usage audit failed: ${error.message}`);
  process.exit(1);
});

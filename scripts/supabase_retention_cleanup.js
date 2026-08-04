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

function parseArgs(argv) {
  const args = {
    execute: false,
    yes: false,
    days: null,
    tables: null,
    limit: 5000,
    skipArchive: false,
    skipSourceRawCompaction: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') args.execute = true;
    else if (arg === '--yes') args.yes = true;
    else if (arg === '--skip-archive') args.skipArchive = true;
    else if (arg === '--skip-source-raw-compaction') args.skipSourceRawCompaction = true;
    else if (arg === '--days') args.days = Number(argv[++i]);
    else if (arg === '--tables') args.tables = String(argv[++i]).split(',').map((item) => item.trim()).filter(Boolean);
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else throw new Error(`unknown_arg:${arg}`);
  }
  return args;
}

const RETENTION_RULES = [
  { table: 'source_audits', column: 'created_at', days: 30 },
  { table: 'connector_runs', column: 'started_at', days: 45 },
  { table: 'worker_logs', column: 'created_at', days: 30 },
  { table: 'worker_job_runs', column: 'started_at', days: 45 },
  {
    table: 'runtime_artifacts',
    column: 'created_at',
    days: 45,
    extraWhere: "and artifact_key not like '%latest%'",
  },
  { table: 'agent_findings', column: 'created_at', days: 45 },
  { table: 'research_reports', column: 'created_at', days: 120 },
];

const SOURCE_RAW_COMPACTION_RULE = {
  table: 'source_raw_documents',
  column: 'collected_at',
  days: 30,
  excerptChars: 500,
};

async function tableColumnExists(client, table, column) {
  const result = await client.query(
    `select 1
     from information_schema.columns
     where table_schema = 'public' and table_name = $1 and column_name = $2
     limit 1`,
    [table, column],
  );
  return result.rowCount > 0;
}

async function archiveRows(client, rule, cutoff, limit, archiveDir) {
  fs.mkdirSync(archiveDir, { recursive: true });
  const archivePath = path.join(archiveDir, `${rule.table}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  const result = await client.query(
    `select *
     from public.${rule.table}
     where ${rule.column} < $1
     ${rule.extraWhere || ''}
     order by ${rule.column} asc
     limit $2`,
    [cutoff, limit],
  );
  const stream = fs.createWriteStream(archivePath, { flags: 'w' });
  for (const row of result.rows) {
    stream.write(`${JSON.stringify(row)}\n`);
  }
  await new Promise((resolve, reject) => {
    stream.end(resolve);
    stream.on('error', reject);
  });
  return { archivePath, archivedRows: result.rows.length };
}

async function compactSourceRawDocuments(client, args, archiveDir) {
  if (args.skipSourceRawCompaction || (args.tables && !args.tables.includes(SOURCE_RAW_COMPACTION_RULE.table))) {
    return null;
  }
  const exists = await tableColumnExists(client, SOURCE_RAW_COMPACTION_RULE.table, SOURCE_RAW_COMPACTION_RULE.column);
  if (!exists) {
    return {
      table: SOURCE_RAW_COMPACTION_RULE.table,
      action: 'compact_content_text',
      skipped: true,
      reason: 'table_or_date_column_missing',
    };
  }
  const cutoffResult = await client.query(`select now() - ($1::text || ' days')::interval as cutoff`, [
    args.days || SOURCE_RAW_COMPACTION_RULE.days,
  ]);
  const cutoff = cutoffResult.rows[0].cutoff;
  const countResult = await client.query(
    `select count(*)::bigint as count
     from public.source_raw_documents
     where collected_at < $1
       and content_text is not null
       and length(content_text) > $2`,
    [cutoff, SOURCE_RAW_COMPACTION_RULE.excerptChars],
  );
  const candidateRows = Number(countResult.rows[0]?.count || 0);
  const result = {
    table: SOURCE_RAW_COMPACTION_RULE.table,
    action: 'compact_content_text',
    retentionDays: args.days || SOURCE_RAW_COMPACTION_RULE.days,
    excerptChars: SOURCE_RAW_COMPACTION_RULE.excerptChars,
    cutoff,
    candidateRows,
    limit: args.limit,
    executed: false,
  };
  if (!args.execute || candidateRows === 0) return result;

  let archive = { archivePath: null, archivedRows: 0 };
  if (!args.skipArchive) {
    archive = await archiveRows(
      client,
      {
        table: SOURCE_RAW_COMPACTION_RULE.table,
        column: SOURCE_RAW_COMPACTION_RULE.column,
        extraWhere: `and content_text is not null and length(content_text) > ${SOURCE_RAW_COMPACTION_RULE.excerptChars}`,
      },
      cutoff,
      args.limit,
      archiveDir,
    );
  }
  const updateResult = await client.query(
    `with candidates as (
       select ctid
       from public.source_raw_documents
       where collected_at < $1
         and content_text is not null
         and length(content_text) > $2
       order by collected_at asc
       limit $3
     )
     update public.source_raw_documents d
     set
       content_text = left(d.content_text, $2),
       metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
         'retention_compacted_at', now(),
         'retention_original_content_chars', length(d.content_text),
         'retention_policy', 'source_raw_30d_excerpt_500'
       )
     from candidates c
     where d.ctid = c.ctid`,
    [cutoff, SOURCE_RAW_COMPACTION_RULE.excerptChars, args.limit],
  );
  return {
    ...result,
    executed: true,
    compactedRows: updateResult.rowCount,
    archivePath: archive.archivePath,
    archivedRows: archive.archivedRows,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.execute && !args.yes) {
    throw new Error('refusing_to_execute_without_--yes');
  }

  const reportsDir = path.join(process.cwd(), '.agent', 'reports');
  const archiveDir = path.join(process.cwd(), '.agent', 'artifacts', 'supabase-retention');
  fs.mkdirSync(reportsDir, { recursive: true });

  const client = new Client(getConnectionConfig());
  await client.connect();

  const selectedRules = RETENTION_RULES
    .filter((rule) => !args.tables || args.tables.includes(rule.table))
    .map((rule) => ({ ...rule, days: args.days || rule.days }));

  const results = [];
  const sourceRawCompaction = await compactSourceRawDocuments(client, args, archiveDir);
  if (sourceRawCompaction) results.push(sourceRawCompaction);
  for (const rule of selectedRules) {
    const exists = await tableColumnExists(client, rule.table, rule.column);
    if (!exists) {
      results.push({ table: rule.table, skipped: true, reason: 'table_or_date_column_missing' });
      continue;
    }

    const cutoffResult = await client.query(`select now() - ($1::text || ' days')::interval as cutoff`, [rule.days]);
    const cutoff = cutoffResult.rows[0].cutoff;
    const countResult = await client.query(
      `select count(*)::bigint as count
       from public.${rule.table}
       where ${rule.column} < $1
       ${rule.extraWhere || ''}`,
      [cutoff],
    );
    const candidateRows = Number(countResult.rows[0]?.count || 0);
    const result = {
      table: rule.table,
      dateColumn: rule.column,
      retentionDays: rule.days,
      cutoff,
      candidateRows,
      limit: args.limit,
      executed: false,
    };

    if (args.execute && candidateRows > 0) {
      let archive = { archivePath: null, archivedRows: 0 };
      if (!args.skipArchive) {
        archive = await archiveRows(client, rule, cutoff, args.limit, archiveDir);
      }
      const deleteResult = await client.query(
        `delete from public.${rule.table}
         where ctid in (
           select ctid
           from public.${rule.table}
           where ${rule.column} < $1
           ${rule.extraWhere || ''}
           order by ${rule.column} asc
           limit $2
         )`,
        [cutoff, args.limit],
      );
      Object.assign(result, {
        executed: true,
        deletedRows: deleteResult.rowCount,
        archivePath: archive.archivePath,
        archivedRows: archive.archivedRows,
      });
    }
    results.push(result);
  }

  await client.end();

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.execute ? 'execute' : 'dry-run',
    note: args.execute
      ? 'Rows were deleted only after optional local JSONL archive. Run VACUUM ANALYZE separately after reviewing results.'
      : 'Dry run only. No rows were deleted.',
    results,
  };

  const reportPath = path.join(reportsDir, `supabase-retention-${report.generatedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Supabase retention ${report.mode}:`);
  for (const row of results) {
    if (row.skipped) {
      console.log(`- ${row.table}: skipped (${row.reason})`);
    } else if (row.executed) {
      if (row.action === 'compact_content_text') {
        console.log(`- ${row.table}: compacted ${row.compactedRows}/${row.candidateRows}, archive=${row.archivePath || 'skipped'}`);
      } else {
        console.log(`- ${row.table}: deleted ${row.deletedRows}/${row.candidateRows}, archive=${row.archivePath || 'skipped'}`);
      }
    } else {
      const action = row.action === 'compact_content_text' ? 'compact candidates' : 'candidate rows';
      console.log(`- ${row.table}: ${row.candidateRows} ${action} older than ${row.retentionDays}d`);
    }
  }
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(`Supabase retention cleanup failed: ${error.message}`);
  process.exit(1);
});

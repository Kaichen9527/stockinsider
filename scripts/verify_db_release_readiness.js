const { Client } = require('pg');

const projectRef = process.env.SUPABASE_PROJECT_REF;
const dbHost = process.env.SUPABASE_DB_HOST;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const dbUser = process.env.SUPABASE_DB_USER || `postgres.${projectRef || ''}`;
const dbPort = process.env.SUPABASE_DB_PORT || '6543';
const dbName = process.env.SUPABASE_DB_NAME || process.env.SUPABASE_DB_DATABASE || 'postgres';

if (!dbPassword || (!projectRef && !dbHost)) {
  console.error('Missing required env vars: SUPABASE_DB_PASSWORD and one of SUPABASE_PROJECT_REF/SUPABASE_DB_HOST');
  process.exit(1);
}

const regions = [
  'ap-northeast-1',
  'ap-southeast-1',
  'ap-northeast-2',
  'us-west-1',
  'us-east-1',
  'ap-southeast-2',
];

const requiredTables = [
  'market_snapshots',
  'stock_signals',
  'institutional_signals',
  'social_signals',
  'recommendations',
  'strategy_actions',
  'line_subscriptions',
  'line_alert_events',
  'pipeline_runs',
  'source_registry',
  'source_health_checks',
  'source_review_queue',
];

const requiredIndexes = [
  'idx_stock_signals_stock_asof',
  'idx_recommendations_date_score',
  'idx_pipeline_runs_type_started',
  'idx_source_registry_status',
  'idx_source_health_checks_source_time',
];

function connectionHosts() {
  if (dbHost) return [dbHost];
  return regions.map((region) => `aws-0-${region}.pooler.supabase.com`);
}

async function connectAnyRegion() {
  for (const host of connectionHosts()) {
    const connectionString = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@${host}:${dbPort}/${dbName}`;
    const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      console.log(`Connected to ${host}`);
      return client;
    } catch (error) {
      console.log(`Failed ${host}: ${error.message}`);
    }
  }
  throw new Error('Could not connect to configured Supabase DB host(s).');
}

(async () => {
  const client = await connectAnyRegion();
  try {
    const tableResult = await client.query(
      `select table_name from information_schema.tables where table_schema='public' and table_name = any($1::text[])`,
      [requiredTables]
    );
    const foundTables = new Set(tableResult.rows.map((row) => row.table_name));

    const indexResult = await client.query(
      `select indexname from pg_indexes where schemaname='public' and indexname = any($1::text[])`,
      [requiredIndexes]
    );
    const foundIndexes = new Set(indexResult.rows.map((row) => row.indexname));

    const missingTables = requiredTables.filter((name) => !foundTables.has(name));
    const missingIndexes = requiredIndexes.filter((name) => !foundIndexes.has(name));

    const threshold = Number(process.env.SIGNAL_FRESHNESS_THRESHOLD_SECONDS || 0);
    if (threshold !== 3600) {
      throw new Error(`SIGNAL_FRESHNESS_THRESHOLD_SECONDS must be 3600, got ${threshold}`);
    }

    if (missingTables.length || missingIndexes.length) {
      throw new Error(
        `Missing tables/indexes: tables=[${missingTables.join(',')}], indexes=[${missingIndexes.join(',')}]`
      );
    }

    console.log('DB release readiness check passed.');
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(`DB release readiness check failed: ${error.message}`);
  process.exit(1);
});

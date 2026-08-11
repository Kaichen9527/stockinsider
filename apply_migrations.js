const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { loadGenericMigrationPlan } = require('./scripts/generic-migration-policy.js');

const projectRef = process.env.SUPABASE_PROJECT_REF;
const dbHost = process.env.SUPABASE_DB_HOST;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const dbUser = process.env.SUPABASE_DB_USER || `postgres.${projectRef || ''}`;
const dbPort = process.env.SUPABASE_DB_PORT || '6543';
const dbName = process.env.SUPABASE_DB_NAME || process.env.SUPABASE_DB_DATABASE || 'postgres';
const canonicalMigrationDir = path.join(__dirname, 'migrations');
const migrationDir = process.env.MIGRATIONS_DIR || canonicalMigrationDir;

const regions = [
  'ap-northeast-1',
  'ap-southeast-1',
  'ap-northeast-2',
  'us-west-1',
  'us-east-1',
  'ap-southeast-2',
];

function loadMigrationPlan() {
  return loadGenericMigrationPlan(fs, migrationDir, canonicalMigrationDir);
}

function connectionHosts() {
  if (dbHost) return [dbHost];
  return regions.map((region) => `aws-0-${region}.pooler.supabase.com`);
}

async function connectAnyRegion() {
  for (const host of connectionHosts()) {
    const connectionString = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@${host}:${dbPort}/${dbName}`;
    const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });

    try {
      console.log(`Trying ${host}...`);
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
  // Validate the complete immutable plan before reading credentials or opening a
  // database connection. SQL is retained in memory so path replacement cannot
  // change the bytes between validation and execution.
  const migrationPlan = loadMigrationPlan();
  if (migrationPlan.length === 0) {
    console.log('No migration files found.');
    return;
  }
  if (!dbPassword || (!projectRef && !dbHost)) {
    throw new Error('Missing required env vars: SUPABASE_DB_PASSWORD and one of SUPABASE_PROJECT_REF/SUPABASE_DB_HOST');
  }

  const client = await connectAnyRegion();
  try {
    await client.query('BEGIN');
    for (const migration of migrationPlan) {
      console.log(`Applying ${migration.name} (${migration.digest})...`);
      await client.query(migration.sql);
    }
    await client.query('COMMIT');
    console.log('All migrations applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();

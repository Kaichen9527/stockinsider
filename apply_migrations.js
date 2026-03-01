const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const projectRef = process.env.SUPABASE_PROJECT_REF;
const dbHost = process.env.SUPABASE_DB_HOST;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const dbUser = process.env.SUPABASE_DB_USER || `postgres.${projectRef || ''}`;
const dbPort = process.env.SUPABASE_DB_PORT || '6543';
const dbName = process.env.SUPABASE_DB_NAME || process.env.SUPABASE_DB_DATABASE || 'postgres';
const migrationDir = process.env.MIGRATIONS_DIR || path.join(__dirname, 'migrations');

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

function listMigrationFiles() {
  return fs
    .readdirSync(migrationDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => path.join(migrationDir, name));
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
  const migrationFiles = listMigrationFiles();
  if (migrationFiles.length === 0) {
    console.log('No migration files found.');
    return;
  }

  const client = await connectAnyRegion();
  try {
    await client.query('BEGIN');
    for (const file of migrationFiles) {
      console.log(`Applying ${path.basename(file)}...`);
      const sql = fs.readFileSync(file, 'utf8');
      await client.query(sql);
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

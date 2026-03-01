const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const regions = [
    'ap-northeast-1', // Tokyo
    'ap-southeast-1', // Singapore
    'ap-northeast-2', // Seoul
    'us-west-1',
    'us-east-1',
    'ap-southeast-2'
];

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

const migrationFile = process.env.MIGRATION_FILE || path.join(__dirname, 'supabase_schema.sql');
const schema = fs.readFileSync(migrationFile, 'utf8');

(async () => {
    const hosts = dbHost ? [dbHost] : regions.map((region) => "aws-0-" + region + ".pooler.supabase.com");
    for (const host of hosts) {
        const encodedPassword = encodeURIComponent(dbPassword);
        const connectionString = `postgresql://${dbUser}:${encodedPassword}@${host}:${dbPort}/${dbName}`;
        const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });

        console.log("Trying " + host + "...");
        try {
            await client.connect();
            console.log("Connected to " + host + "!");
            await client.query(schema);
            console.log('Schema applied successfully.');
            await client.end();
            return;
        } catch (err) {
            console.log("Failed on " + host + ": " + err.message);
        }
    }
    console.log('Could not connect to configured Supabase DB host(s).');
})();

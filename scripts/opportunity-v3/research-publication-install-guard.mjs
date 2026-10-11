import fs from 'node:fs';

// Fixed source inventory. This first-install profile never replays CREATE ROLE,
// CREATE FUNCTION or ALTER lineage over a complete or partially installed v2.
const inventory = JSON.parse(fs.readFileSync(
  new URL('./research-publication-install-inventory.json', import.meta.url), 'utf8'));

export async function assertResearchPublicationFirstInstall(client) {
  const result = await client.query(`SELECT
    EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[])) AS tables,
    EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=ANY($2::text[])) AS functions,
    EXISTS(SELECT FROM pg_roles WHERE rolname=ANY($3::text[])) AS roles,
    EXISTS(SELECT FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN jsonb_array_elements($4::jsonb) x ON c.relname=x->>0 AND a.attname=x->>1
      WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    EXISTS(SELECT FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND t.tgname=ANY($5::text[]) AND NOT t.tgisinternal) AS triggers,
    EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=ANY($6::text[])
        AND position('research_admission_read_committed_required' IN p.prosrc)>0) AS isolation_successor`,
  [inventory.tables, inventory.newFunctionNames, inventory.roles,
    JSON.stringify(inventory.columns), inventory.triggerNames, inventory.guardedPredecessors]);
  const state = result.rows?.[0];
  const keys = ['tables', 'functions', 'roles', 'columns', 'triggers', 'isolation_successor'];
  if (!state || keys.some(key => typeof state[key] !== 'boolean'))
    throw new Error('research_publication_install_detection_failed');
  if (keys.some(key => state[key]))
    throw new Error('research_publication_existing_profile_requires_reviewed_successor');
  return state;
}

/** Call under the reviewed migration lock, before any migration mutation. */
export async function assertInstalledResearchSuccessorPlan(client, { researchAgentExtension, migrations }) {
  const detected = await client.query(`SELECT
    to_regclass('public.opportunity_financial_observations_v1') IS NOT NULL
      OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='append_financial_fact_pre_history_v1') AS financial_history,
    to_regclass('public.research_cloud_acceptances_v1') IS NOT NULL AS cloud_receipts`);
  const state = detected.rows?.[0];
  if (!state || typeof state.financial_history !== 'boolean' || typeof state.cloud_receipts !== 'boolean')
    throw new Error('migration_successor_detection_failed');
  if ((state.financial_history || state.cloud_receipts) && !researchAgentExtension)
    throw new Error('installed_research_successor_requires_extension');
  const selected = new Set(migrations.map((migration) => migration.relativePath));
  if (state.financial_history && !selected.has('migrations/20261005_financial_history_admission_v1.sql')
    || state.cloud_receipts && !selected.has('migrations/20261004_research_cloud_receipts_v1.sql'))
    throw new Error('installed_research_successor_missing_from_plan');
  return state;
}

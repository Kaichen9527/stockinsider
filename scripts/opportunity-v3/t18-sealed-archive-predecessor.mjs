import {canonicalTailMetadata, POST50_BASELINE_SHA256, tailMetadataSha, tailPost50Baseline} from './research-publication-tail-entry-guard.mjs';
import {readTailNamespace} from './research-publication-tail-entry-namespace.mjs';
import {fingerprintResearchPublicationCatalog, readResearchPublicationCatalog} from './research-publication-catalog.mjs';
import {assertContaboValuationBridgeStage, stageContaboHistoricalValuation} from './t18-historical-valuation-bridge.mjs';

const archiveNamespaceSha256 = 'f659690731faa2867c319824978777312b42314786655d4eb0efd9140e801528';
const correctedNamespaceSha256 = '4d810effe8ca7fa2a532a3f7ab5f3e286d4f155af659ee4fb232c2eb670e18cb';
const dashboardFunctions = [
  'extensions.pg_stat_statements(boolean)',
  'extensions.pg_stat_statements_info()',
  'extensions.pg_stat_statements_reset(oid,oid,bigint,boolean)',
  'extensions.uuid_generate_v1()',
  'extensions.uuid_generate_v1mc()',
  'extensions.uuid_generate_v3(uuid,text)',
  'extensions.uuid_generate_v4()',
  'extensions.uuid_generate_v5(uuid,text)',
  'extensions.uuid_nil()',
  'extensions.uuid_ns_dns()',
  'extensions.uuid_ns_oid()',
  'extensions.uuid_ns_url()',
  'extensions.uuid_ns_x500()',
];

const correctPublicUsage = 'REVOKE USAGE ON SCHEMA public FROM PUBLIC RESTRICT';
const correctDashboardViews = 'REVOKE ALL ON TABLE extensions.pg_stat_statements, extensions.pg_stat_statements_info FROM dashboard_user RESTRICT';
const correctDashboardFunctions = 'REVOKE EXECUTE ON FUNCTION ' + dashboardFunctions.join(', ') + ' FROM dashboard_user RESTRICT';

const permissionChecks = `SELECT
    NOT has_function_privilege('dashboard_user','extensions.pg_stat_statements_reset(oid,oid,bigint,boolean)','EXECUTE')
    AND has_schema_privilege('dashboard_user','extensions','USAGE')
    AND has_table_privilege('dashboard_user','extensions.pg_stat_statements','SELECT')
    AND has_table_privilege('dashboard_user','extensions.pg_stat_statements_info','SELECT')
    AND has_function_privilege('dashboard_user','extensions.uuid_generate_v4()','EXECUTE') AS dashboard_closed,
    NOT EXISTS (
      SELECT FROM pg_catalog.pg_default_acl d
      CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
      WHERE (d.defaclnamespace=0 OR d.defaclnamespace='extensions'::regnamespace)
      AND a.grantee='dashboard_user'::regrole
    ) AS defaults_closed`;

/** Runs only inside the engineering publication transaction on the owned sealed archive clone. */
export async function stageT18SealedArchivePredecessor(client) {
  const peer = {sealedArchivePeer: true};
  await assertContaboValuationBridgeStage(client, peer);
  if (tailMetadataSha(await readTailNamespace(client)) !== archiveNamespaceSha256)
    throw Error('t18_archive_namespace_mismatch');

  const valuation = await stageContaboHistoricalValuation(client, peer);
  await client.query(correctPublicUsage);
  await client.query(correctDashboardViews);
  await client.query(correctDashboardFunctions);

  if (tailMetadataSha(await readTailNamespace(client)) !== correctedNamespaceSha256)
    throw Error('t18_archive_corrected_namespace_mismatch');
  const permissions = (await client.query(permissionChecks)).rows[0];
  if (permissions?.dashboard_closed !== true || permissions?.defaults_closed !== true)
    throw Error('t18_archive_dashboard_profile_mismatch');

  const catalog = await readResearchPublicationCatalog(client, tailPost50Baseline.scope);
  if (canonicalTailMetadata(fingerprintResearchPublicationCatalog(catalog)) !== canonicalTailMetadata(tailPost50Baseline.fingerprints))
    throw Error('publication_tail_predecessor_catalog_mismatch');

  return Object.freeze({
    predecessor: Object.freeze({
      baselineSha256: POST50_BASELINE_SHA256,
      namespaceSha256: correctedNamespaceSha256,
      profile: 'contabo-t18-sealed-archive-2026-09-19'
    }),
    valuation
  });
}

'use strict';

const crypto = require('crypto');
const path = require('path');

// This is an immutable legacy plan, not migration discovery. A reviewed change
// must update both the filename and digest. V3-family migrations use their own
// authority-bound plan and must never be added here.
const GENERIC_MIGRATION_DIGESTS = Object.freeze({
  '20260228_opportunity_engine.sql': '61e72af43fdddaf70cd6fc2dca581840fdcd76062ce72d1ea8d90d723abf6574',
  '20260301_release_ops.sql': 'faf82f3a7a22b2d4b69b749550264262c0aeaba75b9bbacf80d8e03d94932804',
  '20260314_social_signals_bulltalk.sql': '5a38d171d722bf6efad3ea3bfac38e900ac79fb1fbfc2c46237d4ee5100404ac',
  '20260314_story_alpha_radar.sql': '3dc57ee882a7b7e06262317cc8796f5d1154144a20b0e8025fa955802817f994',
  '20260314_story_alpha_radar_followup.sql': '2707af592354eccfef6011d5f8edd5b58b18c883921f2c2d7effc9e662545899',
  '20260315_research_runtime_v21.sql': '9b98539eb46a1a6590c3ba01a7641e39596079a7ff59a0abca423a90257dfef0',
  '20260315_research_system_v2.sql': '54c070056addcfb7c1955355dcd841817bad73d362090b2cb71d7a7547dcb607',
  '20260315_z_source_watchlists_constraints.sql': '85c0b9089e6bb4ed9dd03c6f8b4c75e9ce86d064d282fdb556036c5c91690f99',
  '20260316_telegram_kol_channels.sql': 'cdd1b481097c5227b2c1a2ac3a665afa69163eb703d3e64c5b421fce4fed5618',
  '20260317_kol_expansion.sql': '56be51d5282ca76179ddce46b992e14a0f41b245cb16d1dc455e6a39de924178',
  '20260317_recommendation_history.sql': 'a3e77abc14f8a504af0a5006a0a9401444a244931e2b0f20a0ab8a43b026e61c',
  '20260510_social_refresh_supabase_runtime.sql': '28ba013983908dc4d5063620a5a7b48cc444ae838e13085c7ca7d4820dc016e9',
  '20260516_v5_18_broker_cross_theme_model.sql': '90c9b032bcb5bff78355ef9a2c9d78a3e2a8bb5f822ebb8a60c1b97f9c9947d0',
  '20260519_v5_20_social_broker_leak.sql': 'ca34dabd5cb0822555d89c44428efbb257dffa0fbca1ed1caf01b336a0cbd084',
  '20260523_v5_22_ml_ptt_broker_radar.sql': '2e0f6748e6ca1836514904cfe54da8cb32cd5febdfd2d75d80e751f2b0b5e78c',
  '20260607_v5_28_revaluation_jobs.sql': '643cc995d8e35cdc067e8e46c6a117881e271836b49e5b1dee9c0ad80a55b9df',
  '20260621_supabase_io_budget_indexes.sql': 'bc9cc62bf2f437c4d44161e8a50ee0555f3e3bd43a2fd5cd30b6de47bc857948',
});

const GENERIC_MIGRATION_ALLOWLIST = Object.freeze(Object.keys(GENERIC_MIGRATION_DIGESTS));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function loadGenericMigrationPlan(fs, migrationDir, canonicalDir) {
  const expectedDir = path.resolve(canonicalDir);
  const requestedDir = path.resolve(migrationDir);
  invariant(requestedDir === expectedDir, 'generic_migration_directory_not_canonical');
  const directoryStat = fs.lstatSync(requestedDir);
  invariant(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(), 'generic_migration_directory_not_regular');
  const realExpectedDir = fs.realpathSync(expectedDir);
  invariant(fs.realpathSync(requestedDir) === realExpectedDir, 'generic_migration_directory_authority_mismatch');
  const present = new Set(fs.readdirSync(requestedDir));
  const missing = GENERIC_MIGRATION_ALLOWLIST.filter((name) => !present.has(name));
  invariant(missing.length === 0, `generic_migration_plan_incomplete:${missing.join(',')}`);
  return Object.freeze(GENERIC_MIGRATION_ALLOWLIST.map((name) => {
    const file = path.join(requestedDir, name);
    invariant(path.dirname(file) === expectedDir, 'generic_migration_path_escape');
    const pathStat = fs.lstatSync(file);
    invariant(pathStat.isFile() && !pathStat.isSymbolicLink(), `generic_migration_not_regular:${name}`);
    invariant(fs.realpathSync(file) === path.join(realExpectedDir,name), `generic_migration_authority_mismatch:${name}`);
    const noFollow = fs.constants?.O_NOFOLLOW ?? 0;
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
    let sql;
    try {
      const descriptorStat = fs.fstatSync(descriptor);
      invariant(descriptorStat.isFile(), `generic_migration_descriptor_not_regular:${name}`);
      sql = fs.readFileSync(descriptor, 'utf8');
    } finally {
      fs.closeSync(descriptor);
    }
    const digest = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
    invariant(digest === GENERIC_MIGRATION_DIGESTS[name], `generic_migration_digest_mismatch:${name}`);
    return Object.freeze({ name, file, sql, digest, size: Buffer.byteLength(sql) });
  }));
}

function listGenericMigrationFiles(fs, migrationDir, canonicalDir = migrationDir) {
  return loadGenericMigrationPlan(fs, migrationDir, canonicalDir).map((entry) => entry.file);
}

module.exports = { GENERIC_MIGRATION_ALLOWLIST, GENERIC_MIGRATION_DIGESTS,
  listGenericMigrationFiles, loadGenericMigrationPlan };

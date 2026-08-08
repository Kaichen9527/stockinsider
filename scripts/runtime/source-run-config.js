'use strict';

const { canonicalJson, invariant, sha256 } = require('./codec');

const OWNER_LABEL = 'com.stockinsider.auth-source-worker';
const CONFIG_SCHEMA = 'stockinsider-auth-source-dag-v1';
const CONFIG_FILE_SHA256 = '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2';
const LEGACY_SEED_SYMBOLS = Object.freeze(['2301','2303','2308','2330','2337','2344','2345','2356','2379','2382','2408','2421','2449','2454','3008','3017','3034','3037','3189','3231','3324','3533','3711','4958','5347','5388','6230','6285','6415','6669']);
const STAGE_CONFIG = Object.freeze([
  Object.freeze({ ordinal: 0, name: 'source_sync', dependsOn: null, timeoutSeconds: 900, maxAttempts: 5 }),
  Object.freeze({ ordinal: 1, name: 'mention_claim_extraction', dependsOn: 'source_sync', timeoutSeconds: 900, maxAttempts: 5 }),
  Object.freeze({ ordinal: 2, name: 'candidate_funnel', dependsOn: 'mention_claim_extraction', timeoutSeconds: 600, maxAttempts: 5 }),
  Object.freeze({ ordinal: 3, name: 'facts_refresh', dependsOn: 'candidate_funnel', timeoutSeconds: 1200, maxAttempts: 5 }),
  Object.freeze({ ordinal: 4, name: 'analysis_revision', dependsOn: 'facts_refresh', timeoutSeconds: 1200, maxAttempts: 5 }),
  Object.freeze({ ordinal: 5, name: 'compact_radar_projection', dependsOn: 'analysis_revision', timeoutSeconds: 300, maxAttempts: 5 }),
]);
const LEGACY_STAGES = Object.freeze(STAGE_CONFIG.map((stage) => stage.name));
const EXPECTED_CONFIG = Object.freeze({ schema: CONFIG_SCHEMA, runtimeMode: 'legacy_correctness', ownerLabel: OWNER_LABEL,
  trigger: Object.freeze({ kind: 'launchd_calendar', timezone: 'Asia/Taipei', weekdays: Object.freeze([1,2,3,4,5]), hour: 18, minute: 20, runAtLoad: false }),
  leaseSeconds: 120, legacyRadarBaseUrl: 'https://stockinsider-three.vercel.app',
  legacySeedSymbols: LEGACY_SEED_SYMBOLS, stages: STAGE_CONFIG });

function validateAuthSourceDagConfig(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  invariant(buffer.length === 1226 && buffer.at(-1) === 10, 'scheduler config byte shape');
  invariant(sha256(buffer) === CONFIG_FILE_SHA256, 'scheduler config hash mismatch');
  const body = buffer.subarray(0, -1).toString('utf8');
  const parsed = JSON.parse(body);
  invariant(body === canonicalJson(parsed), 'scheduler config must be canonical JSON');
  invariant(canonicalJson(parsed) === canonicalJson(EXPECTED_CONFIG), 'scheduler config schema mismatch');
  return Object.freeze({ config: parsed, bytes: buffer, sha256: CONFIG_FILE_SHA256,
    seedSetHash: sha256(canonicalJson(['stockinsider-legacy-seed-set-v1', LEGACY_SEED_SYMBOLS])) });
}

// Test-only deterministic resolver. Production derives the same tuple inside the
// database acquire RPC and never accepts caller time/cutoff fields.
function resolveLegacyCorrectnessOccurrence({ now, schedule, calendar, seedSymbols, config }) {
  invariant(Array.isArray(seedSymbols) && canonicalJson(seedSymbols) === canonicalJson(LEGACY_SEED_SYMBOLS), 'legacy seed set');
  invariant(LEGACY_STAGES.every((stage, index) => (config.stages[index]?.name ?? config.stages[index]) === stage), 'legacy stage order');
  const occurrence = schedule.deriveOccurrence(now);
  const session = calendar.completedSessionAt(occurrence.cutoff);
  const canonicalConfig = canonicalJson({ schema: CONFIG_SCHEMA, stages: STAGE_CONFIG, seedSymbols, config });
  return Object.freeze({ scheduledOccurrenceId: occurrence.id, sourceCutoff: occurrence.cutoff, tradingDate: session?.date ?? null,
    tradingSessionAuthorityHash: session?.authorityHash ?? null, configCanonical: canonicalConfig, configHash: sha256(canonicalConfig),
    seedSetHash: sha256(canonicalJson(['stockinsider-legacy-seed-set-v1', seedSymbols])), stages: LEGACY_STAGES });
}

module.exports = { CONFIG_FILE_SHA256, CONFIG_SCHEMA, EXPECTED_CONFIG, LEGACY_SEED_SYMBOLS, LEGACY_STAGES, OWNER_LABEL, STAGE_CONFIG,
  resolveLegacyCorrectnessOccurrence, validateAuthSourceDagConfig };

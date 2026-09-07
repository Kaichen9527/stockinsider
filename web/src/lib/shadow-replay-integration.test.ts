import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const research = fs.readFileSync(path.join(here, 'candidate-research.ts'), 'utf8');

test('Shadow observation persists and reloads a frozen final-publication payload instead of replaying mutable stage rows', () => {
  const start = research.indexOf('export async function recordCandidateShadowObservation');
  const end = research.indexOf('export async function loadActiveCandidateSourceErrors', start);
  assert.ok(start >= 0 && end > start, 'Shadow observation boundary exists');
  const body = research.slice(start, end);
  assert.match(body, /buildFrozenShadowReplayPayload\(/u);
  assert.match(body, /persistFrozenShadowReplayPayload\(/u);
  assert.match(body, /input[.]publicationPhase !== 'final'/u);
  assert.match(body, /loadFrozenShadowReplayPayload\(/u);
  assert.match(body, /loadedReplay[.]payload[.]cards/u);
  assert.doesNotMatch(body, /from\('candidate_daily_stage_snapshots'\)/u);
  assert.doesNotMatch(body, /shadow_stage_authority_read_failed/u);
});

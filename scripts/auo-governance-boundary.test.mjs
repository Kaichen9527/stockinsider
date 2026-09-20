import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root,
  '.loop-engineering/state/changes/source-led-opportunity-engine-v3/active-artifact-catalog-v3.json');
const templateRelative = 'openspec/changes/evidence-valuation-research-v6/auo-deep-research-template.md';
const templatePath = path.join(root, templateRelative);

test('the AUO-only preview contract stays outside the full-market active authority graph', () => {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const activePaths = new Set([
    ...(catalog.activeFiles ?? []).map((file) =>
      `.loop-engineering/state/changes/source-led-opportunity-engine-v3/${file}`),
    ...(catalog.incorporatedFiles ?? []),
    ...(catalog.historicalAuditFiles ?? []),
  ]);
  assert.equal(activePaths.has(templateRelative), false);

  const template = readFileSync(templatePath, 'utf8');
  assert.match(template, /Status: user-approved single-issuer preview scope/u);
  assert.match(template, /does not change the global writer/u);
  assert.match(template, /same versioned research artifact and report\ncomponent/u);
});

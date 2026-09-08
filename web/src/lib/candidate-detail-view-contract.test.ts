import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('candidate detail confirms a final only with explicit complete publication metadata', async () => {
  const source = await readFile(new URL('../app/stock/[symbol]/CandidateDetailView.tsx', import.meta.url), 'utf8');
  assert.match(source, /publicationStatus === "final"[\s\S]{0,180}finalPublicationStatus === "confirmed"[\s\S]{0,180}datasetCompletenessPct === 100/u);
  assert.match(source, /datasetMissingComponents\.length === 0/u);
  assert.match(source, /舊版唯讀（終版資料未完整）/u);
  assert.match(source, /終版缺項：\{datasetMissingComponents\.join/u);
  assert.doesNotMatch(source, /publicationStatus === "final" \|\| detailRecord\.isFinal/u);
});

test('enriched public prose requires an accepted receipt for the same dossier, revision and input hash', async () => {
  const source = await readFile(new URL('./candidate-detail.ts', import.meta.url), 'utf8');
  assert.match(source, /from\('candidate_dossier_submission_receipts'\)/u);
  assert.match(source, /\.eq\('revision_id', String\(row\.id\)\)\.eq\('status', 'accepted'\)/u);
  assert.match(source, /acceptedReceiptKeys\.has\(`\$\{String\(dossier\.id/u);
  assert.match(source, /String\(receipt\.input_hash[^\n]+expectedInputHash/u);
});

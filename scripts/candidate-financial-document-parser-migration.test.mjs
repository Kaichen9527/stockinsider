import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../migrations/20260907_03_candidate_financial_document_parser_v6.sql', import.meta.url), 'utf8');
const documentMigration = readFileSync(new URL('../migrations/20260907_02_candidate_financial_documents_v6.sql', import.meta.url), 'utf8');

test('candidate financial parser migration persists only bounded, hash-bound receipt locators', () => {
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;\s*$/u);
  assert.doesNotMatch(migration, /\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS parser_locators jsonb NOT NULL DEFAULT '\[\]'::jsonb/u);
  assert.match(migration, /jsonb_array_length\(COALESCE\(p_parser_locators,'\[\]'::jsonb\)\)>200/u);
  assert.match(migration, /candidate_financial_document_locator_invalid/u);
  assert.match(migration, /source_sha256,locator,extracted_at/u);
  assert.match(migration, /complete_candidate_financial_document_receipt_parser_v7/u);
  assert.match(migration, /NOT EXISTS \([\s\S]*jsonb_array_elements\(p_parser_locators\)/u);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public[.]complete_candidate_financial_document_receipt_v6[\s\S]*FROM service_role/u);
  assert.match(migration, /v_receipt[.]acquisition_job_id[\s\S]*candidate_financial_acquisition_jobs_v4[\s\S]*terminal_reason='complete'/u);
  assert.match(documentMigration, /SELECT id,'www[.]nanya[.]com'[\s\S]*symbol='2408'/u);
});

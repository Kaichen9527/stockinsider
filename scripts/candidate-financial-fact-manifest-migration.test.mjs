import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../migrations/20260911_candidate_financial_fact_manifest_v8.sql', import.meta.url), 'utf8');

test('v8 document completion persists structural evidence and awaits exact fact validation', () => {
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;\s*$/u);
  assert.doesNotMatch(sql, /\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(sql, /complete_candidate_financial_document_receipt_parser_v8/u);
  assert.match(sql, /candidate_financial_parser_evidence_v8/u);
  assert.match(sql, /candidate_financial_document_fact_links_v8/u);
  assert.match(sql, /manifest[.]row->>'xbrl_context'=v_fact #>> '\{locator,xbrl_context\}'/u);
  assert.match(sql, /manifest[.]row->>'entity_identifier'=stock[.]symbol/u);
  assert.match(sql, /manifest[.]row->>'period_end'/u);
  assert.match(sql, /financial_validation_status/u);
  assert.match(sql, /finalize_candidate_financial_document_validation_v8/u);
  assert.match(sql, /v_receipt_status:=CASE WHEN v_status='validated'/u);
  assert.match(sql, /receipt_status=v_receipt_status/u);
  assert.match(sql, /official_financial_validation_receipts/u);
  assert.match(sql, /v_locator \? 'page'/u, 'PDF diagnostics remain persistable without creating facts');
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public[.]complete_candidate_financial_document_receipt_parser_v7[\s\S]*FROM service_role/u);
  assert.match(sql, /WHEN jsonb_array_length\(p_facts\)>0 THEN 'validation_pending'/u);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../migrations/20260911_candidate_financial_fact_manifest_v8.sql', import.meta.url), 'utf8');

test('v8 document completion validates individual facts without hiding document errors', () => {
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;\s*$/u);
  assert.doesNotMatch(sql, /\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(sql, /complete_candidate_financial_document_receipt_parser_v8/u);
  assert.doesNotMatch(sql, /record_official_financial_validation/u,
    'Arelle xValid is a structural gate, not an accounting-consistency receipt');
  assert.match(sql, /parsed[.]locator->>'xbrl_context'=v_fact #>> '\{locator,xbrl_context\}'/u);
  assert.match(sql, /parsed[.]locator->>'xbrl_concept'=v_fact #>> '\{locator,xbrl_concept\}'/u);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public[.]complete_candidate_financial_document_receipt_parser_v7[\s\S]*FROM service_role/u);
  assert.match(sql, /jsonb_array_length\(p_missing_requirements\)>0[\s\S]*THEN 'partial'/u);
});

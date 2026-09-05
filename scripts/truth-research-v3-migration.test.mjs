import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../migrations/20260906_truth_research_v3.sql', import.meta.url), 'utf8');

test('truth research migration quarantines legacy TPEx multiples without deleting audit rows', () => {
  assert.match(migration, /tpex_pe_yield_column_misread_v2_2/u);
  assert.match(migration, /quality_status = 'quarantined'/u);
  assert.match(migration, /valuation_parser_version/u);
  assert.match(migration, /valuation_data_quality_row_audit/u);
  assert.match(migration, /to_jsonb\(f\)/u);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+public\.(?:fundamental_snapshots|official_multiple_history)/iu);
});

test('source search and coverage share the versioned GDELT validity predicate', () => {
  assert.match(migration, /CREATE OR REPLACE VIEW public\.source_search_documents_v3/u);
  assert.match(migration, /matcher_version' = 'gdelt-tw-context-v2'/u);
  assert.match(migration, /FROM public\.source_search_documents_v3 d/u);
});

test('historical PTT bulk rankings are retained but invalidated for candidate discovery', () => {
  assert.match(migration, /SET content_semantics = 'bulk_institutional_ranking'/u);
  assert.match(migration, /'invalidation_reason', 'ptt_bulk_institutional_ranking'/u);
  assert.match(migration, /document\.document_url = mention\.source_url/u);
  assert.doesNotMatch(migration, /DELETE FROM public\.candidate_source_mentions/u);
  assert.match(migration, /DISABLE TRIGGER trg_source_raw_documents_writer_fence/u);
  assert.match(migration, /ENABLE TRIGGER trg_source_raw_documents_writer_fence/u);
});

test('source verification filters use explicit evidence state instead of confidence thresholds', () => {
  assert.match(migration, /metadata->>'verification_status' = 'verified'/u);
  assert.doesNotMatch(migration, /p_verification_status = '已證實' AND d\.confidence/u);
});

test('connector cursor authority is private and scoped per connector', () => {
  assert.match(migration, /PRIMARY KEY \(connector, scope_key\)/u);
  assert.match(migration, /REVOKE ALL ON public\.valuation_data_quality_events,[\s\S]*public\.source_connector_cursors[\s\S]*FROM PUBLIC, anon, authenticated/u);
  assert.doesNotMatch(migration, /cursor_metadata|source_timestamp/u);
  assert.doesNotMatch(migration, /\b(?:DROP TABLE|TRUNCATE)\b/iu);
});

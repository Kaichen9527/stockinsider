import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../migrations/20260913_candidate_financial_prelisting_v7.sql', import.meta.url), 'utf8');
const financial = await readFile(new URL('../web/src/lib/candidate-official-financials.ts', import.meta.url), 'utf8');
const drain = await readFile(new URL('../web/src/app/api/internal/candidate-financial-queue-drain/route.ts', import.meta.url), 'utf8');
const research = await readFile(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');

test('pre-listing terminalization is lease-bound and revalidates official authority in PostgreSQL', () => {
  assert.match(migration, /WHERE job[.]job_id = p_job_id[\s\S]*job[.]status = 'running'[\s\S]*job[.]lease_owner = p_owner/u);
  assert.match(migration, /MIN\(instrument[.]valid_from::date\)[\s\S]*instrument[.]instrument_type = 'common_stock'[\s\S]*instrument[.]listing_status = 'active'/u);
  assert.match(migration, /v_job[.]period_end >= v_listed_on/u);
  assert.match(migration, /terminal_reason = 'unsupported_issuer'/u);
  assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/u);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/u);
});

test('both enqueue and existing backlog paths use official listing authority', () => {
  assert.match(financial, /candidateFinancialPeriodPredatesListing/u);
  assert.match(financial, /terminalize_candidate_financial_prelisting_job_v7/u);
  assert.match(financial, /notApplicablePeriods/u);
  assert.match(drain, /stock_instruments_v3[\s\S]*valid_from/u);
  assert.match(research, /candidate_financial_listing_authority_read_failed/u);
  assert.match(research, /listedOn: listedOnByStock/u);
});

test('TPEx transport retries bounded identity responses without accepting a partial body', () => {
  assert.match(financial, /const TPEX_FETCH_ATTEMPTS = 6/u);
  assert.match(financial, /'accept-encoding': 'identity', Connection: 'close'/u);
  assert.match(financial, /tpex_range_length_mismatch/u);
});

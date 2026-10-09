"""Synthetic reconciliation and real local CLI tests; never contact a server."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import terminal_package as t


def uuid(i): return f'00000000-0000-4000-8000-{i:012}'


def fixture():
    run = dict(id=uuid(1), status='success', evaluation_at='2026-09-25T10:00:00Z', started_at='2026-09-25T10:00:00Z',
               finished_at='2026-09-25T10:20:00Z', candidate_count=1, completed_count=1, failed_count=0, partial_count=0)
    item = dict(id=uuid(4), run_id=uuid(1), stock_id=uuid(2), detail_revision_id=uuid(3), symbol='2330', status='success', finished_at='2026-09-25T10:19:00Z')
    detail = dict(id=uuid(3), stock_id=uuid(2), research_run_id=uuid(1), session_date='2026-09-24', as_of='2026-09-25T10:10:00Z', available_at='2026-09-25T10:11:00Z')
    instrument = dict(instrument_authority_id=uuid(5), stock_id=uuid(2), symbol='2330', exchange='TWSE', provider='twse', instrument_type='common_stock',
                      listing_status='active', official_name='合成公司', source_timestamp='2026-09-24T00:00:00Z', recorded_at='2026-09-24T01:00:00Z', valid_from='2026-09-24T00:00:00Z', valid_to=None)
    db = dict(schema='candidate-repeatable-read-audit-v1', transaction_read_only='on', transaction_isolation='repeatable read', snapshot='1:1:', run=run,
              items=[item], details=[detail], instruments=[instrument])
    readiness = dict(schema='contabo-readonly-readiness-v1', host='5.104.83.211', observed_at='2026-09-26T00:00:00Z', production_written=False, credentials_exported=False, database=db)
    gap = dict(item, financial_coverage=dict(status='incomplete', requiredFieldPeriods=1, verifiedFieldPeriods=0,
               missing=[dict(factKey='quarterly_revenue', periodEnd='2026-06-30')]), model_coverage=dict(status='complete', next12mBridgeComplete=False), valuation_method='pb_reference', technical_status='success')
    gaps = dict(readiness, observed_at='2026-09-25T16:00:00Z', database=dict(db, schema='candidate-financial-gap-audit-v1', items=[gap]))
    candidate = dict(symbol='2330', name='合成公司', exchange='TWSE', stock_id=uuid(2), revision=uuid(3), instrument_authority_id=uuid(5), security_type='common_stock', research_status='success', session_date='2026-09-24')
    snapshot = dict(schema_version='candidate-terminal-run-audit-v1', terminal_run_accounted_for=True, complete=False, authoritative_snapshot_available=False, full_app_coverage_verified=False,
                    publish_allowed=False, production_updated=False, run=run, as_of=run['evaluation_at'], scope='one_terminal_run', expected_count=1, candidates=[candidate])
    manifest = dict(schema='current-revenue-editorial-batch-v1', target_period='2026-08', sources=[dict(id=m, url=u, metadata_url=meta, status='parsed', observed_at='2026-09-25T15:00:00Z') for m,(u,meta) in t.revenue.SOURCES.items()])
    row = {'公司代號':'2330','公司名稱':'合成公司','資料年月':'11508','出表日期':'1150917'}
    row.update({field:value for field,value in zip(t.revenue.AMOUNTS.values(),('110','100','100','880','800'))})
    row.update({field:'10' for field in t.revenue.RATES.values()})
    tables = {'TWSE':{'2330':row},'TPEX':{}}
    return [copy.deepcopy(value) for value in (snapshot,readiness,gaps,manifest,tables)]


class TerminalPackageTests(unittest.TestCase):
    def setUp(self): self.values=fixture()
    def run_fixture(self): return t.reconcile(*self.values)
    def test_complete_revenue_is_not_full_investment_article(self):
        report, records=self.run_fixture()
        self.assertEqual(report['revenue_briefs_complete'],1)
        self.assertEqual(report['numerically_checked_briefs'],1)
        self.assertEqual(report['financial_field_periods_missing'],1)
        self.assertEqual(report['full_investment_articles_complete'],0)
        self.assertFalse(records[0][0]['publish_allowed'])
        self.assertFalse(records[0][0]['full_investment_article_ready'])
        self.assertIn('P/B 參考模型就緒不等於完整財務模型',records[0][1])
    def test_quarter_evidence_not_invented_from_monthly_revenue(self):
        _,records=self.run_fixture()
        self.assertEqual(records[0][0]['financial_coverage']['verifiedFieldPeriods'],0)
        self.assertIn('quarterly_financial_evidence_incomplete',records[0][0]['reason_codes'])
    def test_mixed_terminal_runs_rejected(self):
        self.values[2]['database']['run']['id']=uuid(99)
        with self.assertRaisesRegex(ValueError,'inconsistent_run'):self.run_fixture()
    def test_immutable_revision_mismatch_rejected(self):
        self.values[2]['database']['items'][0]['detail_revision_id']=uuid(99)
        with self.assertRaisesRegex(ValueError,'revision_changed'):self.run_fixture()
    def test_missing_rows_rejected_not_inferred_complete(self):
        self.values[2]['database']['items']=[]
        with self.assertRaisesRegex(ValueError,'inventory'):self.run_fixture()
    def test_duplicate_rows_rejected(self):
        self.values[2]['database']['items']*=2
        with self.assertRaisesRegex(ValueError,'duplicate'):self.run_fixture()
    def test_wrong_stock_cannot_bind_good_revenue(self):
        self.values[0]['candidates'][0]['stock_id']=uuid(99)
        with self.assertRaisesRegex(ValueError,'binding_changed'):self.run_fixture()
    def test_official_name_mismatch_blocks_numbers_without_renaming(self):
        self.values[4]['TWSE']['2330']['公司名稱']='另一公司'
        report,records=self.run_fixture()
        self.assertEqual(report['numerically_checked_briefs'],0)
        self.assertIsNone(records[0][0]['facts'])
        self.assertEqual(records[0][0]['name'],'合成公司')
    def test_missing_revision_does_not_acquire_numerical_editorial_acceptance(self):
        self.values[0]['candidates'][0]['revision']=None
        report,records=self.run_fixture()
        self.assertEqual(report['numerically_checked_briefs'],0)
        self.assertIn('immutable_revision_unverified',records[0][0]['reason_codes'])
    def test_missing_revenue_row_remains_visible(self):
        self.values[4]['TWSE']={}
        report,records=self.run_fixture()
        self.assertEqual(report['record_count'],1);self.assertEqual(report['revenue_briefs_complete'],0)
    def test_arithmetic_mismatch_is_not_success(self):
        self.values[4]['TWSE']['2330'][t.revenue.RATES['mom']]='11'
        report,_=self.run_fixture();self.assertEqual(report['revenue_briefs_complete'],0)
    def test_inconsistent_gap_counts_and_duplicates_fail(self):
        self.values[2]['database']['items'][0]['financial_coverage']['missing']*=2
        with self.assertRaisesRegex(ValueError,'cardinality'):self.run_fixture()
    def test_readwrite_transaction_cannot_be_relabelled(self):
        self.values[2]['database']['transaction_read_only']='off'
        with self.assertRaisesRegex(ValueError,'readonly_transaction'):self.run_fixture()
    def test_source_url_and_period_must_match(self):
        for mutate in (lambda v:v[3].update(target_period='2026-09'),lambda v:v[3]['sources'][0].update(url='https://untrusted.example')):
            self.values=fixture();mutate(self.values)
            with self.assertRaises(ValueError):self.run_fixture()
    def test_future_source_or_gap_observation_fails(self):
        for mutate in (lambda v:v[3]['sources'][0].update(observed_at='2027-01-01T00:00:00Z'),lambda v:v[2].update(observed_at='2027-01-01T00:00:00Z')):
            self.values=fixture();mutate(self.values)
            with self.assertRaises(ValueError):self.run_fixture()
    def test_symbolic_segment_period_is_preserved_not_assigned_a_date(self):
        fin=self.values[2]['database']['items'][0]['financial_coverage']
        fin['missing']=[dict(factKey='Display:revenue',periodEnd='latest_reported_quarter')]
        report,records=self.run_fixture()
        self.assertEqual(report['symbolic_period_requirements'],1)
        self.assertEqual(records[0][0]['missing_field_periods'][0]['periodEnd'],'latest_reported_quarter')
        fin['missing'][0]['factKey']='unknown'
        with self.assertRaisesRegex(ValueError,'symbolic'):self.run_fixture()
    def test_boolean_counts_and_impossible_dates_rejected(self):
        fin=self.values[2]['database']['items'][0]['financial_coverage'];fin['requiredFieldPeriods']=True
        with self.assertRaisesRegex(ValueError,'count'):self.run_fixture()
        fin['requiredFieldPeriods']=1;fin['missing'][0]['periodEnd']='2026-02-30'
        with self.assertRaises(ValueError):self.run_fixture()
    def test_original_inputs_not_mutated(self):
        original=copy.deepcopy(self.values);self.run_fixture();self.assertEqual(self.values,original)
    def test_does_not_copy_private_freeform_fields(self):
        self.values[2]['database']['items'][0]['secret']='PRIVATE_TOKEN'
        self.values[1]['database']['details'][0]['summary']='PRIVATE_ARTICLE'
        report,records=self.run_fixture();out=json.dumps([report,records]);self.assertNotIn('PRIVATE_TOKEN',out);self.assertNotIn('PRIVATE_ARTICLE',out)
    def test_json_duplicates_and_nonfinite_rejected(self):
        for raw in (b'{"x":1,"x":2}',b'{"x":NaN}'):
            with self.assertRaises(ValueError):t.strict(raw)
    def test_read_verifies_hash_and_rejects_symlinks(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'a';p.write_bytes(b'valid');link=Path(d)/'link';link.symlink_to(p)
            self.assertEqual(t.read(p,t.revenue.sha(b'valid')),b'valid')
            for path,h in ((p,'0'*64),(link,t.revenue.sha(b'valid'))):
                with self.assertRaises(ValueError):t.read(path,h)
    def test_real_node_projection_uses_transaction_not_two_read_claim(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'readiness.json';raw=json.dumps(self.values[1]).encode();p.write_bytes(raw)
            done=t.subprocess.run(['node','--experimental-strip-types',str(t.ROOT/'scripts/project-terminal-audit.mjs'),str(p),t.revenue.sha(raw)],capture_output=True,check=True,timeout=10)
            value=json.loads(done.stdout);self.assertEqual(value['consistency_mode'],'captured_database_repeatable_read_read_only');self.assertFalse(value['complete'])
            bad=t.subprocess.run(['node','--experimental-strip-types',str(t.ROOT/'scripts/project-terminal-audit.mjs'),str(p),'0'*64],capture_output=True,timeout=10)
            self.assertNotEqual(bad.returncode,0)

if __name__=='__main__':unittest.main()

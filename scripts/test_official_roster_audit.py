import importlib.util
import json
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('official_roster_audit', Path(__file__).with_name('official_roster_audit.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class OfficialRosterTests(unittest.TestCase):
    def fixture(self, url):
        return json.dumps([{'公司代號': '2330' if url == m.SOURCES['TWSE'] else '6488',
                           '公司簡稱': 'fixture', '董事長': 'not retained', '出表日期': '1150925'}]).encode()

    def test_match_has_no_publication_or_security_authority(self):
        r = m.audit([{'symbol': '2330', 'name': 'fixture'}], self.fixture)
        self.assertEqual(r['identities'][0]['status'], 'official_company_match')
        self.assertFalse(r['publish_allowed'])
        self.assertFalse(r['identities'][0]['security_type_verified'])
        self.assertNotIn('not retained', json.dumps(r))

    def test_missing_6000_not_deleted_or_renamed(self):
        r = m.audit([{'symbol': '6000', 'name': '6000'}], self.fixture)
        self.assertEqual(r['identities'][0]['status'], 'not_in_observed_listed_company_feeds')
        self.assertFalse(r['identities'][0]['automatic_correction'])

    def test_failed_source_does_not_prove_absence(self):
        def fail(url):
            raise TimeoutError('do not log arbitrary details')
        r = m.audit([{'symbol': '6000', 'name': '6000'}], fail)
        self.assertEqual(r['identities'][0]['status'], 'unresolved_source_unavailable')
        self.assertNotIn('arbitrary', json.dumps(r))

    def test_both_markets_matching_is_conflict(self):
        r = m.audit([{'symbol': '2330'}], lambda _: self.fixture(m.SOURCES['TWSE']))
        self.assertEqual(r['identities'][0]['status'], 'conflicting_official_matches')

    def test_duplicates_rejected(self):
        rows = [{'公司代號': '2330', '公司簡稱': 'x'}]
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            m.parse_master(json.dumps(rows + rows))
        with self.assertRaises(ValueError):
            m.audit([{'symbol': '2330'}, {'symbol': '2330'}], self.fixture)

    def test_renamed_card_retains_both_names(self):
        r = m.audit([{'symbol': '2330', 'name': 'old fixture'}], self.fixture)
        self.assertFalse(r['identities'][0]['name_matches_exactly'])
        self.assertEqual(r['identities'][0]['observed_name'], 'old fixture')

    def test_empty_official_table_does_not_mean_zero_companies(self):
        with self.assertRaises(ValueError):
            m.parse_master(b'[]')

    def test_arbitrary_url_rejected_without_request(self):
        with self.assertRaises(ValueError):
            m.fetch_source('http://169.254.169.254/')


if __name__ == '__main__':
    unittest.main()

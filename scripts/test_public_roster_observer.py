"""Synthetic public-projection boundary tests; never contact the live website."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request

spec = importlib.util.spec_from_file_location('public_roster_observer', Path(__file__).with_name('public_roster_observer.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def card(i):
    return {'symbol': str(1000 + i), 'chineseName': '合成測試公司', 'detailRevisionId': 'fixture-' + str(i)}


def fixture(found=43):
    groups = {'found': [card(i) for i in range(found)], 'waiting': [card(found)], 'actionable': []}
    daily = {'snapshotPublishedAt': '2026-09-25T08:00:00Z', 'snapshotStale': True,
             'stageCounts': {stage: len(rows) for stage, rows in groups.items()},
             'stages': {stage: rows[:40] for stage, rows in groups.items()},
             'projectionHealth': {'contentAsOf': '2026-09-12', 'freshnessStatus': 'stale_readonly',
                                  'actionAuthority': 'disabled'}}
    def fetch(url, timeout):
        query = parse_qs(urlsplit(url).query)
        if not query:
            body = copy.deepcopy(daily)
        else:
            stage, offset = query['stage'][0], int(query['offset'][0])
            assert query['snapshotPublishedAt'] == [daily['snapshotPublishedAt']]
            items = copy.deepcopy(groups[stage][offset:offset + 40])
            consumed = offset + len(items)
            body = {'schemaVersion': 'radar-stage-page-v1', 'snapshotPublishedAt': daily['snapshotPublishedAt'],
                    'stage': stage, 'offset': offset, 'limit': 40, 'total': len(groups[stage]),
                    'nextOffset': consumed if consumed < len(groups[stage]) else None, 'items': items}
        return body, {'http_status': 200, 'response_sha256': 'a' * 64}
    return daily, groups, fetch


class PublicRosterTests(unittest.TestCase):
    def audit(self, fetch):
        return m.observe(fetch, pause=lambda _: None)

    def changed_page(self, mutate, count=43):
        _, _, fetch = fixture(count)
        def wrapper(url, **kw):
            body, meta = fetch(url, **kw)
            if '?' in url:
                mutate(body)
            return body, meta
        return self.audit(wrapper)

    def test_all_public_pages_accounted_without_authority_promotion(self):
        result = self.audit(fixture()[2])
        self.assertEqual(result['observed_unique_count'], 44)
        self.assertTrue(result['public_stage_coverage_complete'])
        self.assertFalse(result['complete'])
        self.assertFalse(result['full_app_coverage_verified'])
        self.assertFalse(result['authoritative_snapshot_available'])
        self.assertFalse(result['production_updated'])
        self.assertEqual(result['articles_published'], 0)
        self.assertEqual(result['source_content_as_of'], '2026-09-12')
        self.assertIn('public_projection_not_verified_fresh', result['blockers'])

    def test_no_secret_or_price_or_article_content_copied(self):
        daily, groups, fetch = fixture(1)
        groups['found'][0].update(currentPrice=999, article='not a licensed body', token='secret-fixture')
        result = self.audit(fetch)
        encoded = json.dumps(result)
        self.assertNotIn('secret-fixture', encoded)
        self.assertNotIn('licensed body', encoded)
        self.assertNotIn('currentPrice', encoded)

    def test_unavailable_not_empty_complete(self):
        def fetch(*args, **kwargs):
            raise TimeoutError('never copy arbitrary exceptions or credentials')
        result = self.audit(fetch)
        self.assertIsNone(result['expected_count'])
        self.assertFalse(result['public_stage_coverage_complete'])
        self.assertIn('public_read_unavailable', result['blockers'])
        self.assertNotIn('credentials', json.dumps(result))

    def test_snapshot_drift_blocks(self):
        result = self.changed_page(lambda page: page.update(snapshotPublishedAt='other'))
        self.assertIn('public_page_identity_or_snapshot_drift', result['blockers'])

    def test_wrong_cursor_blocks(self):
        result = self.changed_page(lambda page: page.update(nextOffset=0))
        self.assertIn('public_page_cursor_invalid', result['blockers'])

    def test_empty_nonterminal_page_blocks(self):
        result = self.changed_page(lambda page: page.update(items=[]))
        self.assertIn('public_page_incomplete', result['blockers'])

    def test_duplicated_page_symbol_not_counted_twice(self):
        result = self.changed_page(lambda page: page['items'].__setitem__(1, copy.deepcopy(page['items'][0])))
        self.assertIn('public_page_duplicate_or_invalid_symbol', result['blockers'])

    def test_revision_drift_blocks(self):
        result = self.changed_page(lambda page: page['items'][0].update(detailRevisionId='changed'))
        self.assertIn('public_card_revision_drift', result['blockers'])

    def test_malformed_public_symbol_blocks(self):
        result = self.changed_page(lambda page: page['items'][0].update(symbol='../file'))
        self.assertIn('public_card_identity_invalid', result['blockers'])

    def test_wrong_stage_or_total_blocks(self):
        for update in ({'stage': 'actionable'}, {'total': 999}, {'total': True}, {'offset': False}, {'limit': 41}):
            with self.subTest(update=update):
                result = self.changed_page(lambda page: page.update(update))
                self.assertIn('public_page_identity_or_snapshot_drift', result['blockers'])

    def test_invalid_counts_not_treated_as_zero(self):
        for value in (None, True, -1, 5001):
            with self.subTest(value=value):
                daily, _, fetch = fixture()
                daily['stageCounts']['found'] = value
                result = self.audit(fetch)
                self.assertIsNone(result['expected_count'])
                self.assertIn('public_stage_counts_invalid', result['blockers'])

    def test_request_budget_bounded(self):
        result = self.audit(fixture(650)[2])
        self.assertEqual(len(result['surface_observations']), m.MAX_REQUESTS)
        self.assertIn('public_acquisition_budget_exhausted', result['blockers'])
        self.assertFalse(result['public_stage_coverage_complete'])

    def test_snapshot_identity_required(self):
        daily, _, fetch = fixture()
        daily['snapshotPublishedAt'] = None
        self.assertIn('public_snapshot_identity_missing', self.audit(fetch)['blockers'])

    def test_fresh_label_does_not_grant_database_authority(self):
        daily, _, fetch = fixture()
        daily['snapshotStale'] = False
        daily['projectionHealth']['freshnessStatus'] = 'fresh'
        result = self.audit(fetch)
        self.assertTrue(result['public_stage_coverage_complete'])
        self.assertFalse(result['complete'])
        self.assertIn('authoritative_candidate_snapshot_not_available', result['blockers'])

    def test_untrusted_redirects_rejected_before_following(self):
        handler = m.PublicOnlyRedirect()
        for url in ('https://evil.example/api/radar/daily', 'http://127.0.0.1/api/radar/daily',
                    'http://169.254.169.254/latest/meta-data/', 'https://user:secret@stockinsider-three.vercel.app/api/radar/daily',
                    'https://stockinsider-three.vercel.app/api/internal/candidate-dossier-bundle'):
            with self.subTest(url=url):
                self.assertFalse(m.allowed_url(url))
                with self.assertRaisesRegex(ValueError, 'redirect_outside'):
                    handler.redirect_request(Request(m.BASE), None, 302, '', {}, url)

    def test_fixed_old_public_redirect_remains_explicitly_allowed(self):
        self.assertTrue(m.allowed_url('http://5.104.83.211/api/radar/daily?stage=found&offset=40'))
        self.assertFalse(m.allowed_url('http://5.104.83.211:22/api/radar/daily'))

    def test_nonfinite_and_duplicate_json_keys_rejected(self):
        for raw in ('{"x":NaN}', '{"x":Infinity}', '{"x":1,"x":2}'):
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError):
                    m.strict_json(raw)

    def test_name_control_characters_rejected(self):
        result = self.changed_page(lambda page: page['items'][0].update(chineseName='bad\nname'))
        self.assertIn('public_card_name_invalid', result['blockers'])


if __name__ == '__main__':
    unittest.main()

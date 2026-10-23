import csv
from decimal import Decimal
import io
import unittest
from unittest.mock import patch
import revenue_briefs as r


def row(**changes):
    value = {'公司代號': '2330', '公司名稱': '合成公司', '資料年月': '11508', '出表日期': '1150925'}
    value.update({v: '100' for v in r.AMOUNTS.values()}); value.update({v: '0' for v in r.RATES.values()}); value.update(changes)
    return value


class RevenueTests(unittest.TestCase):
    def test_amounts_not_zero_filled(self):
        for value in (None, '', '--', 'N/A'):
            self.assertIsNone(r.numeric(value))
        self.assertEqual(r.numeric('0'), Decimal(0))
        self.assertEqual(r.numeric('-1,000'), Decimal(-1000))

    def test_nonfinite_or_code_rejected(self):
        for value in ('NaN', 'Infinity', '1e12', True, '=1+1'):
            with self.subTest(value=value), self.assertRaises(ValueError): r.numeric(value)

    def test_roc_period_and_wrong_month(self):
        self.assertEqual(r.period('11508'), '2026-08')
        self.assertIn('requested_month_not_in_observed_feed', r.project_row(row(), '2026-07')['blockers'])
        for value in ('11513', '202608', ''):
            with self.assertRaises(ValueError): r.period(value)

    def test_growth_is_recomputed_not_only_copied(self):
        result = r.project_row(row(**{'營業收入-當月營收': '110', '營業收入-上月比較增減(%)': '10', '營業收入-去年同月增減(%)': '10'}), '2026-08')
        self.assertEqual(result['blockers'], []); self.assertTrue(result['arithmetic_checks']['mom']['reported_rate_agrees'])
        bad = r.project_row(row(**{'營業收入-上月比較增減(%)': '10'}), '2026-08')
        self.assertIn('reported_mom_arithmetic_mismatch', bad['blockers'])

    def test_zero_or_negative_base_has_no_fabricated_rate(self):
        for value in ('0', '-100'):
            result = r.project_row(row(**{'營業收入-上月營收': value}), '2026-08')
            self.assertIsNone(result['arithmetic_checks']['mom']['calculated_percent'])

    def test_schema_duplicates_fail(self):
        with self.assertRaises(ValueError): r.parse_csv(b'wrong,wrong\n1,1\n')
        buf = io.StringIO(); w = csv.DictWriter(buf, fieldnames=list(row())); w.writeheader(); w.writerows([row(), row()])
        with self.assertRaisesRegex(ValueError, 'duplicate_revenue'): r.parse_csv(buf.getvalue().encode())

    def test_text_has_evidence_but_no_publish_authority(self):
        result, text = r.brief({'symbol': '2330', 'name': '合成公司'}, row(), 'TWSE', True, '2026-08')
        self.assertEqual(result['status'], 'factual_brief_complete'); self.assertFalse(result['publish_allowed'])
        self.assertIn('新台幣千元', text); self.assertIn('未匯入正式文章', text)
        self.assertFalse(result['facts']['issuer_publication_time_verified'])

    def test_unverified_identity_stays_blocked_even_with_numbers(self):
        result, _ = r.brief({'symbol': '6000', 'name': '6000'}, row(), None, False, '2026-08')
        self.assertEqual(result['status'], 'blocked_evidence_gap')

    def test_no_data_produces_explicit_missing_brief(self):
        result, text = r.brief({'symbol': '2330', 'name': '<unsafe>'}, None, 'TWSE', True, '2026-08')
        self.assertIsNone(result['facts']); self.assertNotIn('<unsafe>', text)
        self.assertIn('沒有取得', text)

    def test_no_arbitrary_source_or_redirect(self):
        with self.assertRaises(ValueError): r.fetch('http://localhost/')
        with self.assertRaises(ValueError): r.NoRedirect().redirect_request(None)


if __name__ == '__main__': unittest.main()

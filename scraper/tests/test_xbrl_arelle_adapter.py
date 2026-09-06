import unittest

from xbrl_arelle_adapter import XbrlAdapterError, parse_xbrl


INLINE_FIXTURE = b'''<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:t="https://example.test/taxonomy" xmlns:iso4217="http://www.xbrl.org/2003/iso4217"><head><ix:header><ix:resources><xbrli:context id="duration"><xbrli:entity><xbrli:identifier scheme="urn:test">2330</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-06-30</xbrli:endDate></xbrli:period></xbrli:context><xbrli:unit id="TWD"><xbrli:measure>iso4217:TWD</xbrli:measure></xbrli:unit></ix:resources></ix:header></head><body><ix:nonFraction name="t:Revenue" contextRef="duration" unitRef="TWD" decimals="0">123</ix:nonFraction></body></html>'''


class TestArelleAdapter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.rows = parse_xbrl(INLINE_FIXTURE)
        except XbrlAdapterError as exc:
            if "Arelle is required" in str(exc):
                raise unittest.SkipTest(str(exc))
            raise

    def test_normalizes_context_unit_and_fact_metadata(self):
        self.assertEqual(len(self.rows), 1)
        row = self.rows[0]
        self.assertEqual(row["concept"], "t:Revenue")
        self.assertEqual(row["period_start"], "2025-01-01")
        self.assertEqual(row["period_end"], "2025-06-30")
        self.assertIsNone(row["instant"])
        self.assertEqual(row["unit"], "iso4217:TWD")
        self.assertEqual(row["decimals"], 0)
        self.assertEqual(row["consolidated_scope"], "consolidated")

    def test_rejects_remote_sources(self):
        with self.assertRaisesRegex(XbrlAdapterError, "remote URLs are forbidden"):
            parse_xbrl("https://example.test/filing.xhtml")

    def test_rejects_segment_or_scenario_contexts(self):
        dimensional = INLINE_FIXTURE.replace(
            b"</xbrli:entity><xbrli:period>",
            b"</xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension=\"t:BusinessUnit\">t:Memory</xbrldi:explicitMember></xbrli:segment><xbrli:period>",
        ).replace(
            b'xmlns:t="https://example.test/taxonomy"',
            b'xmlns:t="https://example.test/taxonomy" xmlns:xbrldi="http://xbrl.org/2006/xbrldi"',
        )
        with self.assertRaisesRegex(XbrlAdapterError, "segment/scenario facts are not supported"):
            parse_xbrl(dimensional)


if __name__ == "__main__":
    unittest.main()

"""Real Arelle fact-scope regressions; synthetic documents, actual validator."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures/candidate-financial-document-parser"
spec = importlib.util.spec_from_file_location("financial_scope_parser", ROOT / "candidate_financial_document_parser.py")
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)


class PartialFinancialFactScopeTests(unittest.TestCase):
    def parse_markup(self, extra="", duplicate_value=None, directory_name=None, instant="2025-12-31"):
        with tempfile.TemporaryDirectory(prefix=directory_name or "scope-test-") as directory:
            target = Path(directory)
            taxonomy = (FIXTURES / "validated-taxonomy.xsd").read_bytes()
            (target / "validated-taxonomy.xsd").write_bytes(taxonomy)
            original = (FIXTURES / "validated-instance.xbrl").read_text()
            original = original.replace("<xbrli:instant>2025-12-31</xbrli:instant>", f"<xbrli:instant>{instant}</xbrli:instant>")
            if duplicate_value is not None:
                extra += f'<test:Shares contextRef="FY2025" unitRef="shares" decimals="0">{duplicate_value}</test:Shares>'
            payload = original.replace("</xbrli:xbrl>", extra + "</xbrli:xbrl>").encode()
            path = target / "arbitrary-random-name.xbrl"
            path.write_bytes(payload)
            return parser.parse_arelle(path, hashlib.sha256(payload).hexdigest(),
                                      taxonomy_sha256=hashlib.sha256(taxonomy).hexdigest())

    def test_scoped_unrelated_invalid_value_does_not_certify_the_document(self):
        extra = '''<xbrli:unit id="twd"><xbrli:measure xmlns:m="http://www.xbrl.org/2003/iso4217">m:TWD</xbrli:measure></xbrli:unit>
<test:TotalInterestBearingDebt contextRef="FY2025" unitRef="twd" decimals="0">invalid</test:TotalInterestBearingDebt>'''
        output = self.parse_markup(extra=extra)
        self.assertEqual(output["schema"], "candidate-financial-document-parser-v2")
        self.assertEqual(output["status"], "partial")
        self.assertFalse(output["factAcceptance"]["documentFatal"])
        self.assertEqual(output["validation"]["errorCount"], len(output["factAcceptance"]["errors"]))
        self.assertEqual([row["xbrl_concept"] for row in output["validatedFacts"]], ["test:Shares"])
        self.assertEqual(output["validatedFacts"][0]["structuralStatus"], "structurally_validated")
        self.assertFalse(output["factAcceptance"]["extractedValidationCompleted"])
        self.assertIsNone(output["factAcceptance"]["extractedInstanceSha256"])

    def test_direct_invalid_value_remains_rejected(self):
        output = self.parse_markup(duplicate_value="invalid")
        self.assertEqual(output["status"], "partial")
        self.assertEqual(output["validatedFacts"], [])
        self.assertIn("stockinsider:conflictingFactDuplicates", output["validation"]["errorCodes"])

    def test_conflicting_duplicates_are_all_rejected_but_equal_decimals_are_safe(self):
        bad = self.parse_markup(duplicate_value="101")
        self.assertEqual(bad["validatedFacts"], [])
        self.assertEqual(len(bad["factAcceptance"]["rejections"]), 2)
        equal = self.parse_markup(duplicate_value="100.0")
        self.assertEqual(equal["status"], "complete", equal)
        self.assertEqual(len(equal["validatedFacts"]), 2)

    def test_document_proof_is_reproducible_across_private_staging_directories(self):
        first = self.parse_markup(duplicate_value="101", directory_name="scope-first-")
        second = self.parse_markup(duplicate_value="101", directory_name="scope-second-")
        self.assertEqual(first["errorManifestSha256"], second["errorManifestSha256"])
        self.assertEqual(first["factAcceptance"], second["factAcceptance"])

    def test_timestamp_period_cannot_be_shifted_into_previous_official_date(self):
        for instant in ("2026-01-01T12:00:00", "2026-01-01T00:00:00", "2026-01-01T08:00:00+08:00"):
            with self.subTest(instant=instant):
                output = self.parse_markup(instant=instant)
                self.assertEqual(output["status"], "partial")
                self.assertEqual(output["validatedFacts"], [])

    def test_duplicate_xml_identifiers_are_document_fatal(self):
        extra = '''<xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>'''
        output = self.parse_markup(extra=extra)
        self.assertEqual(output["validatedFacts"], [])
        self.assertTrue(output["factAcceptance"]["documentFatal"])
        self.assertTrue(any("idMustBeUnique" in error["code"] for error in output["factAcceptance"]["errors"]))

    def test_corrupt_dts_is_fatal_but_valid_calculation_errors_propagate_transitively(self):
        for weight in ("invalid", "1"):
            with self.subTest(weight=weight), tempfile.TemporaryDirectory() as directory:
                target = Path(directory)
                taxonomy = (FIXTURES / "validated-taxonomy.xsd").read_text().replace("</xs:schema>",
                    '<xs:element name="CashAndCashEquivalents" id="Cash" type="xbrli:monetaryItemType" '
                    'substitutionGroup="xbrli:item" xbrli:periodType="instant" nillable="true"/></xs:schema>')
                (target / "validated-taxonomy.xsd").write_text(taxonomy)
                linkbase = f'''<link:linkbase xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink">
<link:calculationLink xlink:type="extended" xlink:role="http://www.xbrl.org/2003/role/link">
<link:loc xlink:type="locator" xlink:label="equity" xlink:href="validated-taxonomy.xsd#EquityAttributableToOwnersOfParent"/>
<link:loc xlink:type="locator" xlink:label="debt" xlink:href="validated-taxonomy.xsd#TotalInterestBearingDebt"/>
<link:loc xlink:type="locator" xlink:label="cash" xlink:href="validated-taxonomy.xsd#Cash"/>
<link:calculationArc xlink:type="arc" xlink:arcrole="http://www.xbrl.org/2003/arcrole/summation-item" xlink:from="equity" xlink:to="debt" weight="{weight}"/>
<link:calculationArc xlink:type="arc" xlink:arcrole="http://www.xbrl.org/2003/arcrole/summation-item" xlink:from="debt" xlink:to="cash" weight="1"/>
</link:calculationLink></link:linkbase>'''
                (target / "calculation.xml").write_text(linkbase)
                markup = (FIXTURES / "validated-instance.xbrl").read_text().replace('<xbrli:context',
                    '<link:linkbaseRef xlink:type="simple" xlink:href="calculation.xml" xlink:arcrole="http://www.w3.org/1999/xlink/properties/linkbase"/><xbrli:context', 1)
                markup = markup.replace('</xbrli:xbrl>', '''<xbrli:unit id="twd"><xbrli:measure xmlns:m="http://www.xbrl.org/2003/iso4217">m:TWD</xbrli:measure></xbrli:unit>
<test:EquityAttributableToOwnersOfParent contextRef="FY2025" unitRef="twd" decimals="0">100</test:EquityAttributableToOwnersOfParent>
<test:TotalInterestBearingDebt contextRef="FY2025" unitRef="twd" decimals="0">10</test:TotalInterestBearingDebt>
<test:CashAndCashEquivalents contextRef="FY2025" unitRef="twd" decimals="0">10</test:CashAndCashEquivalents></xbrli:xbrl>''')
                path = target / "document.xbrl"
                path.write_text(markup)
                output = parser.parse_arelle(path, hashlib.sha256(path.read_bytes()).hexdigest(),
                    taxonomy_sha256=hashlib.sha256(taxonomy.encode()).hexdigest())
                self.assertEqual(output["status"], "partial")
                if weight == "invalid":
                    self.assertTrue(output["factAcceptance"]["documentFatal"])
                    self.assertEqual(output["validatedFacts"], [])
                else:
                    self.assertFalse(output["factAcceptance"]["documentFatal"])
                    self.assertEqual([row["xbrl_concept"] for row in output["validatedFacts"]], ["test:Shares"])
                    self.assertEqual(len(output["factAcceptance"]["rejections"]), 3)


if __name__ == "__main__":
    unittest.main()

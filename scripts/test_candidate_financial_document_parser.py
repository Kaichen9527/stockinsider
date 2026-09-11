"""Real offline Arelle regressions; no mocked validation success."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures/candidate-financial-document-parser"
spec = importlib.util.spec_from_file_location("financial_parser", ROOT / "candidate_financial_document_parser.py")
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)


class ArelleValidationTest(unittest.TestCase):
    def parse(self, value="100", context="FY2025"):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            (target / "validated-taxonomy.xsd").write_bytes((FIXTURES / "validated-taxonomy.xsd").read_bytes())
            payload = (FIXTURES / "validated-instance.xbrl").read_text().replace(
                ">100</test:Shares>", f">{value}</test:Shares>"
            ).replace('contextRef="FY2025"', f'contextRef="{context}"').encode()
            path = target / "instance.xbrl"
            path.write_bytes(payload)
            return parser.parse_arelle(path, hashlib.sha256(payload).hexdigest())

    def test_complete_local_taxonomy_initializes_validation_runtime(self):
        output = self.parse()
        self.assertEqual(output["status"], "complete", output)
        self.assertEqual(output["missingRequirements"], [])
        self.assertEqual(output["locators"], [{"xbrl_context": "FY2025", "xbrl_concept": "test:Shares"}])
        self.assertEqual(output["validation"]["validFactCount"], 1)
        self.assertEqual(output["validation"]["errorCodes"], [])
        self.assertEqual(output["validatedFacts"][0]["entity_identifier"], "2330")
        self.assertEqual(output["validatedFacts"][0]["period_end"], "2025-12-31")
        self.assertEqual(output["validatedFacts"][0]["duration_kind"], "instant")

    def test_invalid_numeric_fact_is_not_admitted(self):
        output = self.parse(value="not-a-number")
        self.assertEqual(output["status"], "partial", output)
        self.assertIn("arelle_validation_errors", output["missingRequirements"])
        self.assertEqual(output["validation"]["validFactCount"], 0)

    def test_missing_context_is_not_admitted(self):
        self.assertEqual(self.parse(context="missing")["status"], "partial")

    def test_wrong_period_type_and_conflicting_accuracy_are_not_admitted(self):
        original = (FIXTURES / "validated-instance.xbrl").read_text()
        variants = [
            original.replace("<xbrli:instant>2025-12-31</xbrli:instant>",
                             "<xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate>"),
            original.replace('decimals="0"', 'decimals="0" precision="4"'),
        ]
        for payload_text in variants:
            with self.subTest(payload=payload_text[-120:]), tempfile.TemporaryDirectory() as directory:
                target = Path(directory)
                (target / "validated-taxonomy.xsd").write_bytes((FIXTURES / "validated-taxonomy.xsd").read_bytes())
                payload = payload_text.encode()
                path = target / "instance.xbrl"
                path.write_bytes(payload)
                output = parser.parse_arelle(path, hashlib.sha256(payload).hexdigest())
                self.assertEqual(output["status"], "partial", output)
                self.assertEqual(output["validatedFacts"], [], output)

    def test_inline_xbrl_preserves_the_fact_extractors_qualified_name(self):
        path = FIXTURES / "validated-inline.xhtml"
        output = parser.parse_arelle(path, hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertEqual(output["status"], "complete", output)
        self.assertEqual(output["locators"], [{"xbrl_context": "FY2025", "xbrl_concept": "test:Shares"}])


if __name__ == "__main__":
    unittest.main()

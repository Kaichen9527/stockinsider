"""Real offline Arelle regressions; no mocked validation success."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import json
import socket

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures/candidate-financial-document-parser"
spec = importlib.util.spec_from_file_location("financial_parser", ROOT / "candidate_financial_document_parser.py")
parser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser)
socket_spec = importlib.util.spec_from_file_location("financial_parser_socket", ROOT / "candidate_financial_parser_socket.py")
parser_socket = importlib.util.module_from_spec(socket_spec)
socket_spec.loader.exec_module(parser_socket)


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

    def test_representative_statement_families_use_real_offline_validation(self):
        families = [
            ("2330", "Revenue", "100", False, False),
            ("2887", "EquityAttributableToOwnersOfParent", "200", True, False),
            ("2002", "TotalInterestBearingDebt", "30", True, False),
            ("2332", "BasicEarningsPerShare", "-1.25", False, True),
        ]
        for entity, concept, value, instant, per_share in families:
            period = ("<xbrli:instant>2026-06-30</xbrli:instant>" if instant else
                      "<xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate>")
            unit = ("<xbrli:divide><xbrli:unitNumerator><xbrli:measure>money:TWD</xbrli:measure></xbrli:unitNumerator>"
                    "<xbrli:unitDenominator><xbrli:measure>stock:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide>"
                    if per_share else "<xbrli:measure>money:TWD</xbrli:measure>")
            markup = f'''<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:stock="http://www.xbrl.org/2003/instance"
 xmlns:money="http://www.xbrl.org/2003/iso4217" xmlns:link="http://www.xbrl.org/2003/linkbase"
 xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:test="urn:stockinsider:parser-test">
 <link:schemaRef xlink:type="simple" xlink:href="validated-taxonomy.xsd"/>
 <xbrli:context id="Q2"><xbrli:entity><xbrli:identifier scheme="http://www.twse.com.tw">{entity}</xbrli:identifier></xbrli:entity><xbrli:period>{period}</xbrli:period></xbrli:context>
 <xbrli:unit id="unit">{unit}</xbrli:unit>
 <test:{concept} contextRef="Q2" unitRef="unit" decimals="2">{value}</test:{concept}>
</xbrli:xbrl>'''
            with self.subTest(entity=entity), tempfile.TemporaryDirectory() as directory:
                target = Path(directory)
                (target / "validated-taxonomy.xsd").write_bytes((FIXTURES / "validated-taxonomy.xsd").read_bytes())
                path = target / "instance.xbrl"
                path.write_text(markup)
                output = parser.parse_arelle(path, hashlib.sha256(path.read_bytes()).hexdigest(),
                                             expected_entity=entity, expected_period_end="2026-06-30")
                self.assertEqual(output["status"], "complete", output)
                self.assertEqual(output["validatedFacts"][0]["value"], value)
                self.assertEqual(output["validatedFacts"][0]["unit"], "TWD_per_share" if per_share else "TWD")
                self.assertEqual(output["validatedFacts"][0]["entity_identifier"], entity)

    def test_requested_period_is_filtered_before_the_two_hundred_fact_limit(self):
        original = (FIXTURES / "validated-instance.xbrl").read_text()
        old_facts = '<test:Shares contextRef="FY2025" unitRef="shares" decimals="0">100</test:Shares>' * 205
        current = '''<xbrli:context id="FY2026"><xbrli:entity><xbrli:identifier scheme="http://www.twse.com.tw">2330</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2026-06-30</xbrli:instant></xbrli:period></xbrli:context>
<test:Shares contextRef="FY2026" unitRef="shares" decimals="0">101</test:Shares>'''
        markup = original.replace('<test:Shares contextRef="FY2025" unitRef="shares" decimals="0">100</test:Shares>', old_facts + current)
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            (target / "validated-taxonomy.xsd").write_bytes((FIXTURES / "validated-taxonomy.xsd").read_bytes())
            path = target / "instance.xbrl"
            path.write_text(markup)
            output = parser.parse_arelle(path, hashlib.sha256(path.read_bytes()).hexdigest(),
                                         expected_entity="2330", expected_period_end="2026-06-30")
            self.assertEqual(output["status"], "complete", output)
            self.assertEqual(len(output["validatedFacts"]), 1)
            self.assertEqual(output["validatedFacts"][0]["value"], "101")
            other_entity = parser.parse_arelle(path, hashlib.sha256(path.read_bytes()).hexdigest(),
                                               expected_entity="2887", expected_period_end="2026-06-30")
            self.assertEqual(other_entity["status"], "partial")
            self.assertEqual(other_entity["validatedFacts"], [])


class PdfAndSocketBoundaryTest(unittest.TestCase):
    def test_text_pdf_stays_partial_without_an_independent_financial_manifest(self):
        # A real one-page text PDF built deterministically, with valid byte
        # offsets. No API/provider payload or mocked parser success is involved.
        objects = [
            b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length 54 >>\nstream\nBT /F1 12 Tf 50 700 Td (Revenue TWD 100 Q2 2026) Tj ET\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        ]
        payload = bytearray(b"%PDF-1.4\n")
        offsets = [0]
        for number, content in enumerate(objects, 1):
            offsets.append(len(payload))
            payload.extend(f"{number} 0 obj\n".encode() + content + b"\nendobj\n")
        start = len(payload)
        payload.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
        for offset in offsets[1:]:
            payload.extend(f"{offset:010d} 00000 n \n".encode())
        payload.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.pdf"
            path.write_bytes(payload)
            digest = hashlib.sha256(payload).hexdigest()
            output = parser.parse_pdf(path, digest)
            self.assertEqual(output["status"], "partial")
            self.assertEqual(output["inputSha256"], digest)
            self.assertEqual(output["locators"], [{"page": 1}])
            self.assertEqual(output["missingRequirements"], ["validated_pdf_manifest_required"])
            self.assertNotIn("validatedFacts", output)

    def request(self, **fields):
        sender, receiver = socket.socketpair()
        try:
            header = {"format": "xbrl", "byteLength": 1, "sha256": "a" * 64, **fields}
            sender.sendall(json.dumps(header).encode() + b"\nx")
            return parser_socket.receive_request(receiver)
        finally:
            sender.close()
            receiver.close()

    def test_socket_accepts_only_exact_optional_entity_period_selectors(self):
        self.assertEqual(self.request(expectedEntity="2330", expectedPeriodEnd="2026-06-30")[0]["expectedEntity"], "2330")
        self.assertEqual(self.request()[1], b"x", "legacy diagnostics remain compatible")
        for fields in [
            {"expectedEntity": "2330"}, {"expectedEntity": "https://bad.invalid", "expectedPeriodEnd": "2026-06-30"},
            {"expectedEntity": "2330", "expectedPeriodEnd": "2026-02-30"},
        ]:
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                self.request(**fields)


if __name__ == "__main__":
    unittest.main()

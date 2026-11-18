import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from mops_diluted_eps_note import Line, NoteGap, capture_data, extract_layout, read_cell


def glyphs(text, left, top):
    return tuple((char, left + i * 5, left + (i + 1) * 5, top, top + 7) for i, char in enumerate(text))


def line(page, number, prefix="", cells=()):
    top = number * 14
    columns = (260, 335, 410, 485)
    data = glyphs(prefix, 70, top)
    for center, text in zip(columns, cells):
        data += glyphs(text, center - len(text) * 2.5, top)
    return Line(page, number, data)


def note_pages():
    starts = ["114年4月1日", "113年4月1日", "114年1月1日", "113年1月1日"]
    ends = ["至6月30日"] * 4
    cover = [line(1, 1, "股票代碼:3526"), line(1, 2, "合併財務報告暨會計師核閱報告"),
             line(1, 3, "民國114及113年第2季")]
    totals = [
        line(2, 1, "合併財務報表附註"),
        line(2, 2, "(除另註明外,金額以新台幣仟元為單位)"),
        line(2, 3, "二七、每股盈餘"), line(2, 4, "單位:每股元"),
        line(2, 5, cells=starts), line(2, 6, cells=ends),
        line(2, 7, "稀釋每股盈餘", ["$3.88", "$3.70", "$7.66", "$6.34"]),
        line(2, 8, "本期淨利"), line(2, 9, cells=starts), line(2, 10, cells=ends),
        line(2, 11, "歸屬於本公司業主之淨利", ["269,858", "257,757", "534,860", "438,836"]),
        line(2, 12, "用以計算稀釋每股盈餘之"),
        line(2, 13, "淨利", ["275,267", "260,661", "544,223", "442,344"]),
    ]
    shares = [line(3, 1, "股數"), line(3, 2, "單位:仟股"), line(3, 3, cells=starts), line(3, 4, cells=ends),
              line(3, 5, "用以計算稀釋每股盈餘之"),
              line(3, 6, "普通股加權平均股數", ["70,932", "70,390", "71,051", "69,793"])]
    return [cover, totals, shares]


class NoteLayoutTest(unittest.TestCase):
    def test_explicit_periods_units_values_and_glyph_locators(self):
        result = extract_layout(note_pages(), "3526", "2025-06-30")
        quarter, cumulative = result["periods"]
        self.assertEqual(result["currencyUnitLocator"], {"page": 2, "textLine": 2})
        self.assertEqual((quarter["periodStart"], quarter["periodEnd"], quarter["periodKind"]),
                         ("2025-04-01", "2025-06-30", "discrete_quarter"))
        self.assertEqual((cumulative["periodStart"], cumulative["periodEnd"], cumulative["periodKind"]),
                         ("2025-01-01", "2025-06-30", "year_to_date"))
        self.assertEqual(quarter["reportedDilutedEps"]["value"], "3.88")
        self.assertEqual(quarter["reportedDilutedEps"]["unit"], "TWD_per_share")
        self.assertEqual(quarter["reportedParentNetIncome"]["value"], 269_858_000)
        self.assertEqual(quarter["dilutedEarningsNumerator"]["value"], 275_267_000)
        self.assertEqual(quarter["dilutedWeightedAverageShares"]["value"], 70_932_000)
        self.assertEqual(cumulative["dilutedEarningsNumerator"]["value"], 544_223_000)
        self.assertEqual(cumulative["dilutedWeightedAverageShares"]["value"], 71_051_000)
        self.assertEqual(cumulative["dilutedWeightedAverageShares"]["locator"]["periodColumn"], 3)
        self.assertEqual(cumulative["dilutedWeightedAverageShares"]["locator"]["page"], 3)

    def test_rejects_a_different_issuer_or_incorrect_period(self):
        for symbol, end in [("2330", "2025-06-30"), ("3526", "2025-09-30")]:
            with self.assertRaisesRegex(NoteGap, "cover_scope_unverified"):
                extract_layout(note_pages(), symbol, end)

    def test_reordered_share_columns_or_wrong_units_remain_a_gap(self):
        cases = [
            (2, 2, line(3, 3, cells=["114年1月1日", "113年4月1日", "114年4月1日", "113年1月1日"]), "period_columns_mismatch"),
            (2, 1, line(3, 2, "單位:百萬股"), "share_unit_unverified"),
            (1, 1, line(2, 2, "單位:美元"), "note_currency_units_unverified"),
        ]
        for page, row, replacement, reason in cases:
            with self.subTest(reason=reason), self.assertRaisesRegex(NoteGap, reason):
                pages = note_pages()
                pages[page][row] = replacement
                extract_layout(pages, "3526", "2025-06-30")

    def test_does_not_substitute_unadjusted_income_or_a_missing_share_cell(self):
        pages = note_pages()
        pages[1][-1] = line(2, 13, "淨利", ["269,858", "260,661", "544,223", "442,344"])
        with self.assertRaisesRegex(NoteGap, "disclosed_eps_does_not_reconcile"):
            extract_layout(pages, "3526", "2025-06-30")
        pages = note_pages()
        pages[2][-1] = line(3, 6, "普通股加權平均股數", ["", "70,390", "71,051", "69,793"])
        with self.assertRaisesRegex(NoteGap, "amount_cell_invalid"):
            extract_layout(pages, "3526", "2025-06-30")

    def test_preserves_explicit_negative_values_and_refuses_malformed_cells(self):
        self.assertEqual(read_cell(glyphs("($1.25)", 0, 0), "TWD_per_share"), "-1.25")
        self.assertEqual(read_cell(glyphs("(1,237)", 0, 0), "TWD"), -1_237_000)
        for text in ("-", "1,23", "1 2"):
            with self.assertRaises(NoteGap):
                read_cell(glyphs(text, 0, 0), "share")


class CaptureTest(unittest.TestCase):
    def test_capture_identity_clocks_and_all_original_digests(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root)
            receipt = {
                "schema": "vnext-mops-consolidated-ebook-v1", "authority": "raw_document_only",
                "symbol": "3526", "requestedPeriodEnd": "2025-06-30", "archiveFilename": "202502_3526_AI1.pdf",
                "archiveUploadedAt": "2025-08-11T17:02:48+08:00", "knownAt": "2025-08-12T02:00:00Z",
                "listingUrl": "https://doc.twse.com.tw/server-java/t57sb01?step=1&colorchg=1&co_id=3526&year=114&seamon=2&mtype=A",
            }
            originals = [
                ("report.pdf", "documentSha256", b"%PDF-1.6\nfixture"),
                ("listing.html", "listingSha256", b"catalog"),
                ("download-handoff.html", "handoffSha256", b"handoff"),
            ]
            for filename, key, data in originals:
                (directory / filename).write_bytes(data)
                receipt[key] = hashlib.sha256(data).hexdigest()
            receipt["documentBytes"] = len(originals[0][2])
            manifest = directory / "receipt.json"
            manifest.write_text(json.dumps(receipt))
            self.assertEqual(capture_data(directory), (receipt, originals[0][2]))
            manifest.write_text(json.dumps({**receipt, "knownAt": "2025-08-01T02:00:00Z"}))
            with self.assertRaisesRegex(NoteGap, "archive_clock_invalid"):
                capture_data(directory)
            manifest.write_text(json.dumps(receipt))
            (directory / "listing.html").write_bytes(b"altered")
            with self.assertRaisesRegex(NoteGap, "capture_bytes_mismatch"):
                capture_data(directory)


if __name__ == "__main__":
    unittest.main()

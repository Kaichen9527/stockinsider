"""Offline, review-only extraction of the disclosed diluted-EPS note."""
import argparse
import datetime as dt
import hashlib
import io
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlencode

from candidate_financial_document_parser import MAX_PAGES, apply_limits, disable_network

ARCHIVE = "https://doc.twse.com.tw/server-java/t57sb01"
MAX_PDF_BYTES = 50 * 1024 * 1024
SCHEMA = "mops-diluted-eps-note-v1"
THOUSANDS = re.compile(r"(?:[0-9]+|[1-9][0-9]{0,2}(?:,[0-9]{3})+)")
EPS = re.compile(r"[0-9]{1,7}[.][0-9]{2}")
TITLE = re.compile(r"[一二三四五六七八九十百]+、每股盈餘")
MONEY_UNIT = {"(除另註明外,金額以新台幣仟元為單位)", "(除另註明外,金額以新臺幣仟元為單位)"}


class NoteGap(ValueError):
    """A bounded source cannot support the requested extraction."""


def require(condition, reason):
    if not condition:
        raise NoteGap(reason)


def only(items, reason):
    require(len(items) == 1, reason)
    return items[0]


@dataclass(frozen=True)
class Line:
    page: int
    number: int
    glyphs: tuple

    @property
    def text(self):
        return "".join(glyph[0] for glyph in self.glyphs)


def projected_lines(page):
    for index, line in enumerate(page.extract_text_lines(return_chars=True, x_tolerance=2, y_tolerance=3), 1):
        glyphs = tuple((point, char["x0"], char["x1"], char["top"], char["bottom"])
                       for char in line["chars"]
                       for point in unicodedata.normalize("NFKC", char["text"]) if not point.isspace())
        if glyphs:
            yield Line(page.page_number, index, glyphs)


def scope(symbol, end):
    require(isinstance(symbol, str) and re.fullmatch(r"[0-9]{4,6}", symbol) is not None, "issuer_invalid")
    require(isinstance(end, str) and re.fullmatch(r"[0-9]{4}-(06-30|09-30)", end) is not None,
            "quarter_layout_unsupported")
    year = int(end[:4])
    require(2013 <= year <= 2200, "reference_year_invalid")
    quarter = 2 if end.endswith("06-30") else 3
    period_end = dt.date.fromisoformat(end)
    dates = [(dt.date(y, month, 1), period_end.replace(year=y))
             for month in (quarter * 3 - 2, 1) for y in (year, year - 1)]
    return year, quarter, dates


def position(glyph):
    return (glyph[1] + glyph[2]) / 2


def partitions(start_line, end_line, dates):
    """Locate each column from both header lines in the same table."""
    headers = [
        [f"{a.year - 1911}年{a.month}月{a.day}日" for a, _ in dates],
        [f"至{b.month}月{b.day}日" for _, b in dates],
    ]
    centers = []
    for line, parts in zip((start_line, end_line), headers, strict=True):
        require(line.text == "".join(parts), "period_columns_mismatch")
        offset = 0
        row = []
        for part in parts:
            glyphs = line.glyphs[offset:offset + len(part)]
            row.append((glyphs[0][1] + glyphs[-1][2]) / 2)
            offset += len(part)
        centers.append(row)
    require(all(abs(a - b) <= 6 for a, b in zip(*centers, strict=True)), "period_columns_misaligned")
    values = centers[0]
    gaps = [b - a for a, b in zip(values, values[1:])]
    require(all(35 <= gap <= 130 for gap in gaps), "period_columns_misaligned")
    return [values[0] - gaps[0] / 2, *((a + b) / 2 for a, b in zip(values, values[1:])),
            values[-1] + gaps[-1] / 2]


def read_cell(glyphs, unit):
    value = "".join(glyph[0] for glyph in glyphs).replace("$", "").replace("−", "-")
    negative = value.startswith("-") or (value.startswith("(") and value.endswith(")"))
    if value.startswith("(") and value.endswith(")"):
        value = value[1:-1]
    elif value.startswith("-"):
        value = value[1:]
    if unit == "TWD_per_share":
        require(EPS.fullmatch(value) is not None, "eps_cell_invalid")
        return str(-Decimal(value) if negative else Decimal(value))
    require(THOUSANDS.fullmatch(value) is not None, "amount_cell_invalid")
    amount = int(value.replace(",", "")) * 1000
    require(amount <= 9_007_199_254_740_991, "amount_cell_overflow")
    return -amount if negative else amount


def field_row(line, prefix, boundaries, unit):
    require(line.text.startswith(prefix), "note_row_mismatch")
    buckets = [[] for _ in range(len(boundaries) - 1)]
    for glyph in line.glyphs[len(prefix):]:
        if glyph[0] == "$":
            continue
        selected = [i for i, (a, b) in enumerate(zip(boundaries, boundaries[1:])) if a <= position(glyph) < b]
        require(len(selected) == 1, "number_outside_period_columns")
        buckets[selected[0]].append(glyph)
    output = []
    for column, glyphs in enumerate(buckets, 1):
        value = read_cell(glyphs, unit)
        box = [min(g[1] for g in glyphs), min(g[3] for g in glyphs),
               max(g[2] for g in glyphs), max(g[4] for g in glyphs)]
        output.append({"value": value, "unit": unit, "locator": {
            "page": line.page, "textLine": line.number, "periodColumn": column,
            "bbox": [round(point, 2) for point in box],
        }})
    return output


def line_at(lines, token, start=0, stop=None):
    return only([index for index, line in enumerate(lines[start:stop], start)
                 if line.text == token], "note_section_missing_or_ambiguous")


def row_at(lines, prefix, start, stop=None):
    return only([line for line in lines[start:stop] if line.text.startswith(prefix)], "note_row_missing_or_ambiguous")


def verify_cover(lines, symbol, end):
    year, quarter, dates = scope(symbol, end)
    cover = {line.text for line in lines[:12]}
    require("股票代碼:" + symbol in cover
            and "合併財務報告暨會計師核閱報告" in cover
            and f"民國{year - 1911}及{year - 1912}年第{quarter}季" in cover, "cover_scope_unverified")
    return year, dates


def extract_layout(pages, symbol, end):
    require(2 <= len(pages) <= MAX_PAGES, "pdf_page_count_unsupported")
    year, dates = verify_cover(pages[0], symbol, end)
    positions = [(p, i) for p, lines in enumerate(pages) for i, line in enumerate(lines) if TITLE.fullmatch(line.text)]
    page, note = only(positions, "eps_note_heading_missing_or_ambiguous")
    units = [line for lines in pages[1:page + 1] if any(line.text in ("合併財務報告附註", "合併財務報表附註") for line in lines[:5])
             for line in lines[:6] if line.text in MONEY_UNIT]
    currency = only(units, "note_currency_units_unverified")
    lines = pages[page][note:]
    require(len(lines) >= 10 and page + 1 < len(pages) and lines[1].text == "單位:每股元", "note_sections_unverified")

    share_lines = pages[page + 1]
    require(len(share_lines) > 4 and share_lines[0].text == "股數" and share_lines[1].text in ("單位:仟股", "單位:千股"),
            "share_unit_unverified")
    income_header = line_at(lines, "本期淨利", start=4)
    require(income_header + 2 < len(lines), "note_sections_unverified")
    eps_columns = partitions(lines[2], lines[3], dates)
    income_columns = partitions(lines[income_header + 1], lines[income_header + 2], dates)
    share_columns = partitions(share_lines[2], share_lines[3], dates)
    income_total = line_at(lines, "用以計算稀釋每股盈餘之", start=income_header + 3)
    share_total = line_at(share_lines, "用以計算稀釋每股盈餘之", start=4)
    require(income_total + 1 < len(lines) and share_total + 1 < len(share_lines), "note_row_missing_or_ambiguous")
    eps = field_row(row_at(lines, "稀釋每股盈餘", 4, income_header), "稀釋每股盈餘", eps_columns, "TWD_per_share")
    parent = field_row(row_at(lines, "歸屬於本公司業主之淨利", income_header + 3, income_total),
                       "歸屬於本公司業主之淨利", income_columns, "TWD")
    numerator = field_row(lines[income_total + 1], "淨利", income_columns, "TWD")
    shares = field_row(share_lines[share_total + 1], "普通股加權平均股數", share_columns, "share")
    results = []
    for index, (start, finish) in enumerate(dates):
        per_share = Decimal(eps[index]["value"])
        denominator = shares[index]["value"]
        earnings = numerator[index]["value"]
        # The note displays EPS to two decimals and earnings and shares in thousands.
        tolerance = Decimal("0.005") * (denominator + 500) + 500 + abs(per_share) * 500
        require(denominator > 0 and abs(per_share * denominator - earnings) <= tolerance,
                "disclosed_eps_does_not_reconcile")
        if start.year == year:
            results.append({"periodStart": start.isoformat(), "periodEnd": finish.isoformat(),
                            "periodKind": "discrete_quarter" if start.month != 1 else "year_to_date",
                            "reportedDilutedEps": eps[index], "dilutedEarningsNumerator": numerator[index],
                            "dilutedWeightedAverageShares": shares[index], "reportedParentNetIncome": parent[index]})
    return {"currencyUnitLocator": {"page": currency.page, "textLine": currency.number}, "periods": results}


def read_bytes(path, expected, maximum):
    require(isinstance(expected, str) and re.fullmatch(r"[0-9a-f]{64}", expected) is not None, "capture_digest_invalid")
    with path.open("rb") as stream:
        contents = stream.read(maximum + 1)
    require(0 < len(contents) <= maximum and hashlib.sha256(contents).hexdigest() == expected, "capture_bytes_mismatch")
    return contents


def capture_data(directory):
    with (directory / "receipt.json").open("rb") as stream:
        raw = stream.read(8193)
    require(0 < len(raw) <= 8192, "capture_receipt_invalid")
    receipt = json.loads(raw)
    require(isinstance(receipt, dict) and receipt.get("schema") == "vnext-mops-consolidated-ebook-v1"
            and receipt.get("authority") == "raw_document_only", "capture_receipt_invalid")
    symbol, end = receipt.get("symbol"), receipt.get("requestedPeriodEnd")
    year, quarter, _ = scope(symbol, end)
    filename = f"{year}0{quarter}_{symbol}_"
    expected_url = ARCHIVE + "?" + urlencode({
        "step": "1", "colorchg": "1", "co_id": symbol, "year": str(year - 1911), "seamon": str(quarter), "mtype": "A",
    })
    require(receipt.get("archiveFilename") in (filename + "AI1.pdf", filename + "A1.pdf")
            and receipt.get("listingUrl") == expected_url, "archive_identity_invalid")
    uploaded = dt.datetime.fromisoformat(receipt["archiveUploadedAt"])
    acquired = dt.datetime.fromisoformat(receipt["knownAt"])
    require(uploaded.utcoffset() == dt.timedelta(hours=8) and acquired.utcoffset() is not None
            and uploaded.date().isoformat() >= end and uploaded <= acquired <= dt.datetime.now(dt.timezone.utc),
            "archive_clock_invalid")
    read_bytes(directory / "listing.html", receipt.get("listingSha256"), 256 * 1024)
    read_bytes(directory / "download-handoff.html", receipt.get("handoffSha256"), 256 * 1024)
    if receipt.get("holdingCompanyIndexSha256") is not None:
        read_bytes(directory / "holding-company-index.html", receipt["holdingCompanyIndexSha256"], 256 * 1024)
    document = read_bytes(directory / "report.pdf", receipt.get("documentSha256"), MAX_PDF_BYTES)
    require(document.startswith(b"%PDF-") and len(document) == receipt.get("documentBytes"), "capture_pdf_invalid")
    return receipt, document


def main():
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("capture_directory", type=Path)
    args = command.parse_args()
    disable_network()
    apply_limits()
    try:
        import pdfplumber
        from pdfplumber.utils.exceptions import PdfminerException
    except ImportError:
        print(json.dumps({"schema": SCHEMA, "status": "gap", "reason": "pdf_parser_runtime_unavailable"}))
        return 2
    try:
        require(pdfplumber.__version__ == "0.11.8", "pdf_parser_runtime_unavailable")
        receipt, payload = capture_data(args.capture_directory)
        with pdfplumber.open(io.BytesIO(payload), strict_metadata=True) as pdf:
            require(2 <= len(pdf.pages) <= MAX_PAGES, "pdf_page_count_unsupported")
            pages = []
            for page in pdf.pages:
                lines = list(projected_lines(page))
                require(sum(len(line.glyphs) for line in lines) <= 48_000, "page_text_limit_exceeded")
                if not pages:
                    verify_cover(lines, receipt["symbol"], receipt["requestedPeriodEnd"])
                pages.append(lines)
                page.close()
        evidence = extract_layout(pages, receipt["symbol"], receipt["requestedPeriodEnd"])
        output = {"schema": SCHEMA, "status": "extracted", "authority": "issuer_note_pending_review",
                  "symbol": receipt["symbol"], "documentSha256": receipt["documentSha256"],
                  "listingSha256": receipt["listingSha256"], "sourceUrl": receipt["listingUrl"],
                  "sourceKnownAt": receipt["knownAt"], "extractedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                  "runtime": {"parser": "pdfplumber", "version": pdfplumber.__version__}, **evidence}
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 0
    except NoteGap as error:
        print(json.dumps({"schema": SCHEMA, "status": "gap", "reason": str(error)}))
        return 2
    except (KeyError, TypeError, ValueError, OSError, PdfminerException):
        print(json.dumps({"schema": SCHEMA, "status": "gap", "reason": "capture_or_pdf_unavailable"}))
        return 2


if __name__ == "__main__":
    sys.exit(main())

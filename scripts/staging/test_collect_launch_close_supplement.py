#!/usr/bin/env python3

from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import collect_launch_close_supplement as collector


SESSION = "2026-11-17"
BEFORE = datetime(2026, 11, 17, 13, 28, 2, tzinfo=timezone.utc)
CUTOFF = datetime(2026, 11, 17, 13, 30, tzinfo=timezone.utc)


class Response:
    status = 200

    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *details):
        return False

    def read(self, maximum):
        return self.body[:maximum]

    class headers:
        @staticmethod
        def get_content_type():
            return "text/csv"


class CloseSupplementTests(unittest.TestCase):
    def capture(self, name, text, *, observed=BEFORE, rehearsal=False, url=None):
        raw = text.encode("utf-8")
        source_url = collector.source_urls(SESSION)[name]
        with patch.object(collector, "datetime") as clock, patch.object(collector, "build_opener") as opener:
            clock.now.side_effect = [BEFORE, observed]
            opener.return_value.open.return_value = Response(raw)
            result = collector.acquire(name, url or source_url, SESSION, CUTOFF, rehearsal)
        return result

    def report(self, dataset, records):
        return ",".join(collector.HEADERS[dataset]) + "\n" + records

    def listed(self):
        return self.report(29082, "1,1151116,1234,測試,1,條件,115/11/17～115/11/21,措施,內容,\n")

    def test_preserves_exact_licensed_disposition_bytes_without_proving_absence(self):
        sources = [
            ("twse_disposition", self.listed()),
            ("tpex_disposition", self.report(11396, "1151116,5678,測試,1151117~1151121,原因,內容\n")),
        ]
        for name, sample in sources:
            with self.subTest(name=name):
                _, result, raw = self.capture(name, sample)
                self.assertEqual(result["replayPayloadKind"], "positive_disposition")
                self.assertEqual(result["usableRecords"], 1)
                self.assertFalse(result["completeAbsenceProved"])
                self.assertFalse(result["timelySessionPayload"])
                self.assertEqual(result["sha256"], hashlib.sha256(raw).hexdigest())
                self.assertEqual(raw, sample.encode("utf-8"))

    def test_wrong_resource_late_and_rehearsal_leave_no_disposition_body(self):
        for args in ({"url":"https://example.invalid/"}, {"observed":CUTOFF}, {"rehearsal":True}):
            _, result, raw = self.capture("twse_disposition", self.listed(), **args)
            self.assertNotIn("replayPayloadKind", result)
            self.assertIsNone(raw)

    def test_empty_and_invalid_are_distinct_from_unrestricted_status(self):
        _, empty, empty_bytes = self.capture("twse_disposition", self.report(29082, ""))
        self.assertEqual(empty["usableRecords"], 0)
        self.assertFalse(empty["completeAbsenceProved"])
        self.assertIsNotNone(empty_bytes)
        _, bad, raw = self.capture("twse_disposition", self.listed().replace("115/11/21", "115/02/30"))
        self.assertEqual(bad["gap"], "response_unavailable_or_invalid")
        self.assertIsNone(raw)

    def test_exact_day_quote_retention_still_uses_its_separate_scope(self):
        name = "twse_reported_close"
        text = self.report(11764, "20261117,1234,測試,1.25,1,115,20,1,115/3\n")
        _, result, raw = self.capture(name, text)
        self.assertTrue(result["timelySessionPayload"])
        self.assertNotIn("replayPayloadKind", result)
        self.assertEqual(raw, text.encode("utf-8"))

    def test_actual_atomic_write_and_cutoff_use_the_recording_clock(self):
        _, original, raw = self.capture("twse_disposition", self.listed())
        old_mask = os.umask(0o077)
        try:
            with tempfile.TemporaryDirectory() as temp:
                for clock_value, expected in ((BEFORE, True), (CUTOFF, False)):
                    with self.subTest(clock_value=clock_value):
                        with patch.object(collector, "datetime") as clock:
                            clock.now.return_value = clock_value
                            receipt = dict(original)
                            path = Path(temp)
                            collector.retain_source_payload(path, "twse_disposition", receipt, raw, CUTOFF, False)
                        body = path / "twse_disposition.csv"
                        self.assertEqual(body.read_bytes(), raw)
                        self.assertEqual(body.stat().st_mode & 0o777, 0o600)
                        self.assertFalse(body.with_suffix(".csv.part").exists())
                        self.assertEqual(receipt["recordedAt"], clock_value.isoformat())
                        self.assertEqual(receipt["positiveDispositionBytesRecordedByCutoff"], expected)
                        self.assertFalse(receipt["completeAbsenceProved"])
        finally:
            os.umask(old_mask)


if __name__ == "__main__":
    unittest.main()

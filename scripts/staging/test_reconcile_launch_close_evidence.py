from datetime import date, datetime, time
from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest

from reconcile_launch_close_evidence import TAIPEI, reconcile_limit, reconcile_observation, reconcile_range, reconcile_roster, reconcile_signed
from reconcile_launch_close_evidence import reconcile_tpex_suspension, TPEX_STOPPED_TRADING_MIGRATION, TPEX_STOPPED_TRADING_URL


class CloseReconciliationTests(unittest.TestCase):
    session = date(2026, 11, 17)
    cutoff = datetime.combine(session, time(21, 30), TAIPEI)
    body = b"synthetic private payload\n"

    def stamp(self, minute, second=0):
        return datetime.combine(self.session, time(21, minute, second), TAIPEI).isoformat()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.receipt = Path(self.temp.name) / "receipt.json"

    def write(self, data):
        self.receipt.write_text(json.dumps(data))

    def row(self, dataset):
        return {"datasetId": dataset, "httpStatus": 200, "sourceDate": self.session.isoformat(),
                "requestedAt": self.stamp(26), "observedAt": self.stamp(27),
                "sha256": sha256(self.body).hexdigest(), "bytes": len(self.body), "timelySessionPayload": True}

    def observed(self, row):
        self.write({"schema": "stockinsider-close-public-input-observation-v1", "session": self.session.isoformat(),
                    "cutoff": self.cutoff.isoformat(), "captureFinishedAt": self.stamp(28),
                    "publishOrWriterInvoked": False, "sources": {"twse_quotes": row}})
        return reconcile_observation(self.receipt, self.session, self.cutoff, False)["sources"]["twse_quotes"]["status"]

    def test_original_requires_payload_digest_and_a_closed_session_clock(self):
        file = self.receipt.with_name("twse_quotes.csv")
        row = self.row(11549)
        self.assertEqual(self.observed(row), "metadata_only")
        file.write_bytes(self.body)
        self.assertEqual(self.observed(row), "timely_original_verified")
        self.assertEqual(self.observed({**row, "observedAt": self.stamp(31)}), "missed_or_unproven_cutoff")
        self.assertEqual(self.observed({**row, "sourceDate": "2026-11-16"}), "source_date_or_scope_unverified")
        file.write_bytes(self.body.replace(b"private", b"changed"))
        self.assertEqual(self.observed(row), "retained_artifact_mismatch")

    def test_positive_notice_never_qualifies_as_complete_absence(self):
        row = {**self.row(29082), "saved": True, "recordedAt": self.stamp(29),
               "positiveDispositionBytesRecordedByCutoff": True, "completeAbsenceProved": False}
        self.receipt.with_name("twse_disposition.csv").write_bytes(self.body)
        receipt = {"schema": "stockinsider-close-supplement-v2", "session": self.session.isoformat(),
                   "cutoff": self.cutoff.isoformat(), "completedAt": self.stamp(29),
                   "writerInvoked": False, "rankAuthority": False, "rehearsal": False,
                   "sources": {"twse_disposition": row}}
        self.write(receipt)
        report = reconcile_observation(self.receipt, self.session, self.cutoff, True)
        self.assertEqual(report["sources"]["twse_disposition"]["status"], "positive_notice_verified")
        self.assertNotIn("synthetic private payload", json.dumps(report))
        row["completeAbsenceProved"] = True
        self.write(receipt)
        report = reconcile_observation(self.receipt, self.session, self.cutoff, True)
        self.assertEqual(report["sources"]["twse_disposition"]["status"], "source_date_or_scope_unverified")
        self.write({**receipt, "rehearsal": True})
        self.assertEqual(reconcile_observation(self.receipt, self.session, self.cutoff, True)["receiptStatus"], "invalid")

    def auth(self):
        return {"badSignatureHttp": 401, "wrongWriterReleaseHttp": 403, "wrongLeaseHttp": 409,
                "writesAfterNegativeRequests": 0, "ephemeralPostgrestUnixOnly": True, "leaseReleased": True}

    def general_signed(self):
        return {"targetSession": self.session.isoformat(), "verifiedAt": self.stamp(30, 5),
                "formalServiceWrites": False, "scratchRemoved": True}

    def test_signed_turnover_requires_original_cutoff_visibility_and_negative_controls(self):
        data = {**self.row(11549), "availableAt": self.stamp(29), "duplicateReadySameId": True,
                "artifactReadbackVerified": True, "originalCutoff": self.cutoff.isoformat(),
                "session": self.session.isoformat(), "lookup": {"visibleAtOriginal2130": True}}
        report = {**self.general_signed(), "data": data, "auth": self.auth(), "httpClosedBeforeCutoff": True}
        self.write(report)
        read = lambda: reconcile_signed(self.receipt, self.session, self.cutoff, False)["datasets"]["11549"]
        self.assertEqual(read(), "signed_cutoff_readback")
        data["availableAt"] = self.cutoff.isoformat()
        self.write(report)
        self.assertEqual(read(), "unverified")
        data["availableAt"] = self.stamp(29)
        report["auth"]["badSignatureHttp"] = 200
        self.write(report)
        self.assertEqual(read(), "unverified")

    def test_disposition_receipts_require_live_unique_ack_and_preserve_missing_dataset(self):
        row = {**self.row(29082), "availableAt": self.stamp(29), "duplicateReadySameId": True,
               "artifactReadbackVerified": True, "completeAbsenceProved": False,
               "readbackAtCutoff": True, "stage": "acknowledged"}
        report = {**self.general_signed(), "originalCutoff": self.cutoff.isoformat(), "mode": "live",
                  "readClock": self.cutoff.isoformat(), "signedWriterChecks": self.auth(), "reports": [row]}
        self.write(report)
        def read():
            return reconcile_signed(self.receipt, self.session, self.cutoff, True)["datasets"]
        self.assertEqual(read(), {"11396": "unverified", "29082": "signed_positive_notices_only"})
        self.write({**report, "reports": [row, row]})
        self.assertEqual(read()["29082"], "unverified")
        self.write({**report, "mode": "fixture"})
        self.assertEqual(read()["29082"], "unverified")
        self.write({**report, "readClock": self.stamp(31)})
        self.assertEqual(read()["29082"], "unverified")


    def tpex_receipt(self):
        row = {**self.row(11736), "source": TPEX_STOPPED_TRADING_URL, "stage": "acknowledged",
               "retainedOriginal": "original.csv", "retainedAt": self.stamp(28), "availableAt": self.stamp(29),
               "readbackAtCutoff": True, "duplicateReadySameId": True, "artifactReadbackVerified": True,
               "completeAbsenceProved": False, "reportedRows": 20, "fourDigitFacts": 2}
        self.receipt.with_name("original.csv").write_bytes(self.body)
        return {**self.general_signed(), "mode": "tpex-status-live", "originalCutoff": self.cutoff.isoformat(),
                "readClock": self.cutoff.isoformat(), "reviewedGuardsInstalled": True,
                "tpexSuspensionMigrationSha256": TPEX_STOPPED_TRADING_MIGRATION, "signedWriterChecks": self.auth(),
                "reports": [row]}

    def read_tpex(self, report):
        self.write(report)
        return reconcile_tpex_suspension(self.receipt, self.session, self.cutoff)

    def test_tpex_cutoff_requires_live_readback_and_matching_raw(self):
        report = self.tpex_receipt()
        ok = self.read_tpex(report)
        self.assertEqual(ok["datasets"], {"11736": "signed_positive_suspensions_only"})
        self.assertEqual(ok["positiveSuspensions"], 2)
        self.assertIs(ok["originalBytesVerified"], True)
        self.assertEqual(self.read_tpex({**report, "mode": "tpex-status-sample"})["datasets"]["11736"], "unverified")
        self.assertEqual(self.read_tpex({**report, "readClock": self.stamp(29)})["datasets"]["11736"], "unverified")
        self.assertEqual(self.read_tpex({**report, "tpexSuspensionMigrationSha256": "0" * 64})["datasets"]["11736"], "unverified")
        original = self.receipt.with_name("original.csv")
        original.write_bytes(b"altered original")
        self.assertEqual(self.read_tpex(report)["receiptStatus"], "retained_artifact_mismatch")
        original.unlink()
        original.symlink_to(self.receipt)
        self.assertEqual(self.read_tpex(report)["receiptStatus"], "retained_artifact_mismatch")

    def test_tpex_retention_must_precede_ack_and_zero_flags_keep_unknown_absence(self):
        report = self.tpex_receipt()
        row = report["reports"][0]
        for invalid in (
            {"retainedAt": self.stamp(30)},
            {"readbackAtCutoff": False},
            {"availableAt": self.cutoff.isoformat()},
            {"fourDigitFacts": 21},
            {"reportedRows": True},
            {"retainedOriginal": "../elsewhere.csv"},
        ):
            with self.subTest(invalid=invalid):
                self.assertEqual(self.read_tpex({**report, "reports": [{**row, **invalid}]})["datasets"]["11736"], "unverified")
        outcome = self.read_tpex({**report, "reports": [{**row, "fourDigitFacts": 0}]})
        self.assertEqual(outcome["datasets"], {"11736": "signed_no_positive_flags"})
        self.assertIs(outcome["completeAbsenceProved"], False)

    def test_roster_requires_retained_projection_hash_and_closed_clock(self):
        projection = self.receipt.with_name("listing-review.json")
        projection.write_text(json.dumps({"schema": "stockinsider-stage-listed-roster-review-v2",
            "session": self.session.isoformat(), "cutoff": self.cutoff.isoformat(), "large": "x" * 204_000}))
        receipt = {"schema": "stockinsider-stage-listed-roster-capture-v2", "mode": "live",
                   "session": self.session.isoformat(), "cutoff": self.cutoff.isoformat(),
                   "finishedAt": self.stamp(25), "eligibleForRosterReview": True,
                   "registryWrite": False, "rankingAuthority": False, "retainedProjectionSha256": sha256(projection.read_bytes()).hexdigest(),
                   "replay": {"targetSession": self.session.isoformat(), "sameSessionByCutoff": True}}
        self.write(receipt)
        self.assertEqual(reconcile_roster(self.receipt, self.session, self.cutoff)["receiptStatus"], "timely_review_projection")
        projection.write_text("{}")
        self.assertEqual(reconcile_roster(self.receipt, self.session, self.cutoff)["receiptStatus"], "projection_mismatch")

    def test_limit_receipt_requires_each_capture_clock_and_grants_no_authority(self):
        capture = {"observedAt": self.stamp(24), "recordedAt": self.stamp(24, 1)}
        receipt = {"schema": "stockinsider-actual-date-bound-limit-staging-v2",
                   "session": self.session.isoformat(), "cutoff": self.cutoff.isoformat(),
                   "checkedAt": self.stamp(25), "captures": [capture] * 3,
                   "diagnosticResult": {"onePriceLocked": True}, "rawBodiesPersisted": False,
                   "publicationAuthority": False}
        self.write(receipt)
        outcome = reconcile_limit(self.receipt, self.session, self.cutoff)
        self.assertEqual(outcome["receiptStatus"], "single_symbol_receipt_only")
        self.assertIs(outcome["retainedOriginalBytesVerified"], False)
        self.assertIs(outcome["publicationAuthority"], False)

        for invalid in (
            {"observedAt": self.stamp(24)},
            {**capture, "recordedAt": self.stamp(23)},
            {**capture, "recordedAt": self.stamp(26)},
        ):
            with self.subTest(invalid=invalid):
                self.write({**receipt, "captures": [capture, capture, invalid]})
                self.assertEqual(reconcile_limit(self.receipt, self.session, self.cutoff)["receiptStatus"], "invalid")

    def test_disposition_range_requires_same_day_matching_bytes_and_before_cutoff_evidence(self):
        dated = self.receipt.with_name("TWSE-effective-range.json")
        licensed = self.receipt.with_name("TWSE-notice.csv")
        for path in (dated, licensed):
            path.write_bytes(self.body)
        matched = {**self.row(29082), "recordedAt": self.stamp(28)}
        item = {"market": "TWSE", "range": dict(matched), "licensed": dict(matched),
                "reportsAgree": True, "timelyOnThisReplay": True}
        report = {"schemaVersion": "launch-disposition-range-replay-v2", "day": self.session.isoformat(),
                  "cutoff": self.cutoff.isoformat(), "rankingAuthority": False, "durableWriterReceipt": False, "sources": [item]}
        self.write(report)
        def read():
            return reconcile_range(self.receipt, self.session, self.cutoff)["markets"]
        self.assertEqual(read(), {"TWSE": "timely_reports_agree", "TPEX": "missing_or_refused"})
        item["licensed"]["recordedAt"] = self.stamp(31)
        self.write(report)
        self.assertEqual(read()["TWSE"], "missed_or_unproven_cutoff")
        licensed.write_bytes(b"replaced")
        self.assertEqual(read()["TWSE"], "retained_artifact_mismatch")

if __name__ == "__main__":
    unittest.main()

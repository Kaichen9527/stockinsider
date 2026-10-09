import copy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest

from report_events import append_report_events, evaluate_report_events, main, normalize_report_event


def event(**changes):
    raw = {
        "symbol": "2454", "exchange": "TWSE", "broker_id": "fixture-bank", "broker_group_id": "fixture-group",
        "analyst": "Fixture Analyst", "publisher": "Fixture News", "source_type": "media_reported",
        "source_url": "https://news.example/report-1", "original_report_url": None, "report_key": "fixture-report-1",
        "report_date": "2026-09-23", "report_published_at": "2026-09-23T08:00:00+08:00",
        "article_published_at": "2026-09-23T08:10:00+08:00", "source_available_at": "2026-09-23T08:10:00+08:00",
        "first_seen_at": "2026-09-23T08:11:00+08:00", "recorded_at": "2026-09-23T08:12:00+08:00",
        "availability_evidence": {"kind": "observed_snapshot", "evidence_id": "fixture-observation",
                                  "evidence_url": "https://news.example/report-1", "known_at": "2026-09-23T08:11:00+08:00"},
        "rights_status": "permitted", "rights_grant_id": "fixture-grant",
        "rating": {"raw": "Buy", "scale_id": "fixture-scale-v1", "previous": "Hold", "current": "Buy", "action": "upgrade"},
        "target": {"previous": 100, "current": 120, "currency": "TWD", "horizon_months": 12, "share_basis": "ordinary_share"},
        "estimates": [{"metric": "eps", "fiscal_period_end": "2027-12-31", "accounting_basis": "TIFRS_diluted",
                       "currency": "TWD", "unit": "per_ordinary_share", "previous": 10, "current": 12, "reported_change_pct": 20}],
        "extraction_version": "synthetic-fixture-v1",
    }
    return {**raw, **changes}


def grant(**changes):
    return {"grant_id": "fixture-grant", "status": "permitted", "known_at": "2026-09-01T00:00:00Z",
            "expires_at": "2026-10-01T00:00:00Z", "evidence_url": "https://rights.example/fixture-only",
            "permissions": ["factor_use"], "broker_ids": ["fixture-bank"],
            "source_types": ["media_reported", "broker_original", "licensed_provider", "third_party_summary"],
            "source_domains": ["news.example", "other.example"], **changes}


def evaluate(events, **changes):
    return evaluate_report_events(events, **{"cutoff": "2026-09-24T00:00:00Z", "rights_grants": [grant()], **changes})


class ReportEventsTests(unittest.TestCase):
    def test_content_addressing_is_immutable_order_independent_and_retry_safe(self):
        raw = event()
        before = copy.deepcopy(raw)
        sealed = normalize_report_event(raw)
        self.assertEqual(raw, before)
        self.assertEqual(sealed, normalize_report_event(dict(reversed(list(raw.items())))))
        self.assertEqual(sealed, normalize_report_event(sealed))
        self.assertEqual(append_report_events([sealed], [raw]), [sealed])
        corrupt = copy.deepcopy(sealed)
        corrupt["target"]["current"] = 999
        with self.assertRaisesRegex(ValueError, "immutable_event_hash_mismatch"):
            normalize_report_event(corrupt)

    def test_future_date_or_published_information_never_enters_cutoff(self):
        for raw in [event(report_date="2026-10-01"), event(article_published_at="2026-09-25T00:00:00Z"),
                    event(first_seen_at="2026-09-25T00:00:00Z", recorded_at="2026-09-25T00:00:00Z")]:
            result = evaluate([raw])
            self.assertEqual(result["summary"]["counts"]["future"], 1)
            self.assertEqual(result["revision_features"], [])
            self.assertEqual(result["metadata_events"], [])

    def test_old_report_newly_observed_is_not_backfilled_even_with_historical_publication(self):
        raw = event(first_seen_at="2026-09-25T00:00:00Z", recorded_at="2026-09-25T00:00:00Z")
        self.assertEqual(evaluate([raw])["revision_features"], [])
        self.assertEqual(evaluate([raw], cutoff="2026-09-25T01:00:00Z")["summary"]["counts"]["evaluated"], 1)
        raw["availability_evidence"] = None
        result = evaluate([raw], cutoff="2026-09-25T01:00:00Z")
        self.assertEqual(result["revision_features"], [])
        self.assertIn("availability_evidence_missing", result["records"][0]["reasons"])

    def test_newly_observed_old_report_does_not_restart_publication_age(self):
        raw = event(report_date="2000-01-01", report_published_at="2000-01-01T00:00:00Z",
                    first_seen_at="2026-09-24T00:00:00Z", recorded_at="2026-09-24T00:00:00Z")
        result = evaluate([raw])
        self.assertEqual(len(result["metadata_events"]), 1)
        self.assertEqual(result["revision_features"], [])
        self.assertEqual(result["eps_revision_breadth"], [])
        self.assertEqual(result["records"][0]["freshness"]["status"], "stale")
        self.assertIn("report_stale", result["records"][0]["reasons"])
        self.assertEqual(result["age_policy"]["max_age_days"], 60)

    def test_publication_age_boundaries_are_inclusive_for_30_and_60_days(self):
        cutoff = datetime(2026, 9, 24, tzinfo=timezone.utc)
        for days in [30, 60]:
            for seconds, expected in [(0, "fresh"), (1, "stale")]:
                published = cutoff - timedelta(days=days, seconds=seconds)
                raw = event(report_date=published.date().isoformat(), report_published_at=published.isoformat())
                result = evaluate([raw], max_age_days=days)
                freshness = result["records"][0]["freshness"]
                self.assertEqual(freshness["status"], expected)
                self.assertEqual(bool(result["revision_features"]), expected == "fresh")
        for invalid in [0, 366, 60.0, True, "60", None]:
            with self.assertRaisesRegex(ValueError, "invalid_max_age_days"):
                evaluate([event()], max_age_days=invalid)

    def test_missing_publication_age_blocks_and_date_only_uses_conservative_taipei_start(self):
        raw = event(report_date=None, report_published_at=None, article_published_at=None)
        result = evaluate([raw])
        self.assertEqual(result["revision_features"], [])
        self.assertEqual(result["records"][0]["freshness"]["status"], "unknown")
        self.assertIn("report_age_unknown", result["records"][0]["reasons"])
        raw["report_date"] = "2026-08-25"
        result = evaluate([raw], max_age_days=30)
        freshness = result["records"][0]["freshness"]
        self.assertEqual(freshness["precision"], "date_conservative")
        self.assertEqual(freshness["publication_at"], "2026-08-24T16:00:00.000000Z")
        self.assertEqual(freshness["status"], "stale")
        raw["article_published_at"] = "2026-09-23T00:00:00Z"
        freshness = evaluate([raw])["records"][0]["freshness"]
        self.assertEqual(freshness["publication_basis"], "article_published_at")
        self.assertEqual(freshness["status"], "fresh")

    def test_aged_retraction_and_correction_still_suppress_prior_versions(self):
        original = normalize_report_event(event())
        for relation, status in [("retracts_event_id", "retracted"), ("supersedes_event_id", "superseded")]:
            replacement = event(**{relation: original["event_id"]}, report_date="2000-01-01",
                                report_published_at="2000-01-01T00:00:00Z",
                                first_seen_at="2026-09-23T04:00:00Z", recorded_at="2026-09-23T04:00:00Z")
            result = evaluate([original, replacement])
            self.assertEqual(result["summary"]["counts"][status], 1)
            self.assertEqual(result["revision_features"], [])

    def test_late_ingested_stale_report_cannot_displace_current_broker_revision(self):
        old = event(report_key="old-report", report_date="2000-01-01", report_published_at="2000-01-01T00:00:00Z",
                    first_seen_at="2026-09-23T04:00:00Z", recorded_at="2026-09-23T04:00:00Z")
        current = event()
        current["estimates"][0].update(previous=12, current=11)
        result = evaluate([current, old])
        breadth = result["eps_revision_breadth"][0]
        self.assertEqual(breadth["covered_broker_groups"], 1)
        self.assertEqual(breadth["down_broker_groups"], 1)
        self.assertEqual(breadth["up_broker_groups"], 0)

    def test_rights_default_to_metadata_only_and_explicit_block_wins(self):
        for raw, grants in [(event(rights_status="unknown"), []), (event(rights_status="blocked"), [grant()]),
                            (event(), [grant(), grant(status="blocked")])]:
            result = evaluate([raw], rights_grants=grants)
            self.assertEqual(result["summary"]["counts"]["metadata_only"], 1)
            self.assertEqual(result["revision_features"], [])
            self.assertEqual(len(result["metadata_events"]), 1)
        raw = event()
        raw["manual_pdf"] = True
        self.assertEqual(evaluate([raw])["summary"]["invalid_count"], 1)

    def test_rights_scope_expiry_and_known_at_are_enforced_without_future_revocation_leak(self):
        for change in [{"permissions": ["metadata_display"]}, {"source_domains": ["different.example"]},
                       {"broker_ids": ["other-bank"]}, {"expires_at": "2026-09-23T00:00:00Z"},
                       {"known_at": "2026-09-26T00:00:00Z"}, {"permissions": None}]:
            self.assertEqual(evaluate([event()], rights_grants=[grant(**change)])["revision_features"], [], change)
        future_block = grant(status="blocked", known_at="2026-09-25T00:00:00Z")
        self.assertEqual(evaluate([event()], rights_grants=[grant(), future_block])["summary"]["counts"]["evaluated"], 1)
        self.assertEqual(evaluate([event()], cutoff="2026-09-26T00:00:00Z", rights_grants=[grant(), future_block])["revision_features"], [])

    def test_named_media_is_not_promoted_to_original_and_syndication_counts_once(self):
        original = event()
        syndicated = event(source_url="https://other.example/reprint", publisher="Syndication Site")
        result = evaluate([original, syndicated, original])
        self.assertEqual(result["summary"]["duplicate_count"], 2)
        self.assertEqual(len(result["revision_features"]), 3)
        self.assertTrue(all(row["source_type"] == "media_reported" for row in result["revision_features"]))
        self.assertEqual(result["eps_revision_breadth"][0]["covered_broker_groups"], 1)
        self.assertEqual(evaluate([event(source_type="third_party_summary")])["revision_features"], [])
        self.assertEqual(evaluate([event(broker_id=None, broker_group_id=None)])["revision_features"], [])

    def test_unannounced_conflicting_versions_are_quarantined(self):
        one = event()
        conflicting = event(source_url="https://other.example/report")
        conflicting["estimates"][0]["current"] = 15
        result = evaluate([one, conflicting])
        self.assertEqual(result["revision_features"], [])
        self.assertEqual(result["summary"]["counts"]["metadata_only"], 2)
        self.assertTrue(all("conflicting_report_versions_without_correction" in row["reasons"] for row in result["records"]))

    def test_retraction_applies_only_when_known_and_matching_the_same_report(self):
        original = normalize_report_event(event())
        withdrawn = event(retracts_event_id=original["event_id"], first_seen_at="2026-09-25T00:00:00Z",
                          recorded_at="2026-09-25T00:00:00Z", rating=None, target=None, estimates=[])
        before = evaluate([original, withdrawn])
        self.assertEqual(before["summary"]["counts"]["evaluated"], 1)
        after = evaluate([original, withdrawn], cutoff="2026-09-25T01:00:00Z")
        self.assertEqual(after["revision_features"], [])
        self.assertEqual(after["summary"]["counts"]["retracted"], 1)
        self.assertEqual(after["summary"]["counts"]["retraction"], 1)
        withdrawn["report_key"] = "wrong-report"
        mismatch = evaluate([original, withdrawn], cutoff="2026-09-25T01:00:00Z")
        self.assertEqual(mismatch["summary"]["counts"]["evaluated"], 1)
        self.assertTrue(any("invalid_correction_lineage" in row["reasons"] for row in mismatch["records"]))

    def test_correction_preserves_old_ledger_but_only_new_version_contributes(self):
        original = normalize_report_event(event())
        correction = event(supersedes_event_id=original["event_id"], first_seen_at="2026-09-23T02:00:00Z",
                           recorded_at="2026-09-23T02:01:00Z")
        correction["estimates"][0]["current"] = 11
        ledger = append_report_events([original], [correction])
        result = evaluate(ledger)
        self.assertEqual(len(ledger), 2)
        self.assertEqual(result["summary"]["counts"]["superseded"], 1)
        eps = next(row for row in result["revision_features"] if row["kind"] == "eps_revision")
        self.assertAlmostEqual(eps["change_pct"], 10)
        self.assertEqual(original["estimates"][0]["current"], 12)

    def test_fiscal_period_and_accounting_bases_are_not_pooled(self):
        one = event()
        two = event(report_key="other-year")
        two["estimates"][0]["fiscal_period_end"] = "2028-12-31"
        three = event(report_key="different-basis")
        three["estimates"][0]["accounting_basis"] = "adjusted_diluted"
        result = evaluate([one, two, three])
        self.assertEqual(len(result["eps_revision_breadth"]), 3)
        self.assertTrue(all(row["covered_broker_groups"] == 1 for row in result["eps_revision_breadth"]))

    def test_multiple_reports_from_one_broker_group_use_latest_publication_not_article_volume(self):
        one = event()
        two = event(report_key="report-2", report_published_at="2026-09-23T03:00:00Z", article_published_at="2026-09-23T03:10:00Z",
                    first_seen_at="2026-09-23T03:11:00Z", recorded_at="2026-09-23T03:12:00Z")
        two["estimates"][0].update(previous=12, current=11)
        result = evaluate([two, one])
        breadth = result["eps_revision_breadth"][0]
        self.assertEqual(breadth["covered_broker_groups"], 1)
        self.assertEqual(breadth["down_broker_groups"], 1)
        self.assertEqual(breadth["up_broker_groups"], 0)

    def test_concurrent_broker_revisions_cannot_be_cherry_picked_by_input_order(self):
        one = event()
        two = event(report_key="different-report-same-time")
        two["estimates"][0]["current"] = 9
        forward = evaluate([one, two])
        reverse = evaluate([two, one])
        self.assertEqual(forward, reverse)
        self.assertEqual(forward["eps_revision_breadth"][0]["covered_broker_groups"], 0)
        eps = next(row for row in forward["revision_features"] if row["kind"] == "eps_revision")
        self.assertEqual(eps["reason"], "concurrent_broker_revision_conflict")

    def test_zero_and_loss_eps_keep_direction_without_misleading_growth_percentage(self):
        for previous, current, kind, direction in [(0, 1, "zero_base", "up"), (-2, -1, "both_losses", "up"),
                                                    (-1, 1, "loss_to_profit", "up"), (1, -1, "profit_to_loss", "down")]:
            raw = event()
            raw["estimates"][0].update(previous=previous, current=current, reported_change_pct=None)
            eps = next(row for row in evaluate([raw])["revision_features"] if row["kind"] == "eps_revision")
            self.assertEqual(eps["comparison_kind"], kind)
            self.assertEqual(eps["direction"], direction)
            self.assertIsNone(eps["change_pct"])

    def test_missing_previous_unknown_basis_and_adr_targets_never_become_usable_features(self):
        raw = event()
        raw["estimates"][0].update(previous=None, reported_change_pct=21)
        raw["target"].update(currency="USD", share_basis="adr")
        raw["rating"].update(previous=None, action="initiate")
        rows = evaluate([raw])["revision_features"]
        self.assertTrue(all(not row["usable"] for row in rows))
        eps = next(row for row in rows if row["kind"] == "eps_revision")
        self.assertIsNone(eps["previous"])
        self.assertIsNone(eps["change_pct"])
        self.assertEqual(eps["reported_change_pct"], 21)

    def test_bad_shapes_naive_timestamps_and_full_article_payloads_are_rejected(self):
        for raw in [event(full_text="not permitted"), event(first_seen_at="2026-09-23T08:11:00"),
                    event(symbol="MediaTek"), event(source_url="http://insecure.example"), event(report_date="2026-02-30")]:
            self.assertEqual(evaluate([raw])["summary"]["invalid_count"], 1)
        duplicate = event()
        duplicate["estimates"] *= 2
        self.assertEqual(evaluate([duplicate])["summary"]["invalid_count"], 1)
        with self.assertRaisesRegex(ValueError, "event_bound"):
            evaluate([event()] * 10001)

    def test_real_audited_media_facts_are_metadata_only_and_cli_does_not_backdate(self):
        audit = Path(__file__).parent / "sources" / "broker-source-audit.json"
        payload = json.loads(audit.read_text(encoding="utf-8"))
        raw = payload["research_events"][0]
        self.assertEqual(raw["source_type"], "media_reported")
        self.assertIsNone(raw["report_published_at"])
        before = evaluate_report_events([raw], cutoff="2026-09-24T23:59:59Z")
        self.assertEqual(before["metadata_events"], [])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "export.json"
            self.assertEqual(main(["--input", str(audit), "--cutoff", "2026-09-25T01:00:00Z", "--symbol", "2454", "--output", str(output)]), 0)
            result = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(result["validation_status"], "research_only")
            self.assertEqual(result["summary"]["counts"]["metadata_only"], 1)
            self.assertEqual(result["revision_features"], [])
            self.assertEqual(result["metadata_events"][0]["target"]["current"], 7300)


if __name__ == "__main__":
    unittest.main()

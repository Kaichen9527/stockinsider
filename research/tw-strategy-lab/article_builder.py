"""Offline historical-research drafts and a non-executable dry-run queue.

No database, HTTP, publication or broker client is imported. A preview-ready
draft is not a verified stock recommendation or a current entry plan.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

SCHEMA_VERSION = "tw-strategy-lab-articles-v1"
MAX_CANDIDATES = 5000
MAX_INPUT_BYTES = 32 * 1024 * 1024
STRATEGIES = tuple(f"S{index}" for index in range(1, 8))
TERMINALS = {"evaluated", "completed", "blocked", "failed", "no_signals", "zero_trades", "no_trades"}


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _hash(value):
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def _text(value, maximum=256):
    return isinstance(value, str) and 0 < len(value.strip()) <= maximum and not any(ord(ch) < 32 for ch in value)


def _timestamp(value):
    if not _text(value, 64):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except ValueError:
        return None


def _symbol(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9]{4}", value) is not None


def _day(value):
    try:
        return isinstance(value, str) and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value) is not None and date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def _escape(value):
    # Input text is data, never Markdown instructions, HTML or a link target.
    return re.sub(r"([\\`*_{}\[\]()#+.!|<>])", r"\\\1", str(value))


def _reasons(value):
    return sorted(set(item for item in value if _text(item, 128))) if isinstance(value, list) else []


def _research_context(research):
    if research is None:
        return None, ["research_not_supplied"]
    if not isinstance(research, dict):
        return None, ["research_invalid"]
    reasons = []
    if not _text(research.get("schema_version"), 128):
        reasons.append("research_schema_missing")
    if research.get("validation_status") != "exploratory_fixed_survivor_panel":
        reasons.append("research_validation_status_unsupported")
    if not isinstance(research.get("dataset_hash"), str) or not re.fullmatch(r"[0-9a-f]{64}", research["dataset_hash"]):
        reasons.append("research_dataset_hash_invalid")
    period = research.get("period")
    if isinstance(period, list) and len(period) == 2:
        period = {"start": period[0], "end": period[1]}
    if not isinstance(period, dict) or not _day(period.get("start")) or not _day(period.get("end")):
        reasons.append("research_period_invalid")
    elif not "2019-01-01" <= period["start"] <= period["end"] < "2024-01-01":
        reasons.append("research_period_outside_development")
    rows = research.get("strategies")
    if not isinstance(rows, list) or len(rows) != len(STRATEGIES):
        reasons.append("research_strategy_inventory_incomplete")
    elif any(not isinstance(row, dict) or row.get("strategy_id") not in STRATEGIES or row.get("status") not in TERMINALS | {"exploratory"} for row in rows):
        reasons.append("research_strategy_terminal_invalid")
    elif len({row["strategy_id"] for row in rows}) != len(STRATEGIES):
        reasons.append("research_strategy_inventory_duplicate")
    elif any(row["strategy_id"] in {"S5", "S7"} and row["status"] != "blocked" for row in rows):
        reasons.append("event_hypothesis_must_remain_blocked")
    if reasons:
        return None, reasons
    return {"schema_version": research["schema_version"], "dataset_hash": research["dataset_hash"],
            "period": dict(period), "artifact_hash": _hash(research),
            "validation_status": research["validation_status"], "performance_scope": "shared_portfolio_only",
            "current_entry_plan": False}, []


def _symbol_coverage(research, symbol):
    mapping = research.get("by_symbol") if isinstance(research, dict) else None
    value = mapping.get(symbol) if isinstance(mapping, dict) else None
    rows = value.get("strategy_coverage") if isinstance(value, dict) else None
    if not isinstance(rows, list) or len(rows) != len(STRATEGIES):
        return [], ["per_symbol_strategy_coverage_pending"]
    projected = []
    for row in rows:
        if not isinstance(row, dict) or row.get("strategy_id") not in STRATEGIES or row.get("status") not in TERMINALS:
            return [], ["per_symbol_strategy_terminal_invalid"]
        count = row.get("signal_count")
        if count is not None and (type(count) is not int or count < 0):
            return [], ["per_symbol_signal_count_invalid"]
        if row["status"] in {"evaluated", "completed", "no_signals", "zero_trades", "no_trades"} and count is None:
            return [], ["per_symbol_signal_count_missing"]
        if row["strategy_id"] in {"S5", "S7"} and row["status"] != "blocked":
            return [], ["event_hypothesis_must_remain_blocked"]
        projected.append({"strategy_id": row["strategy_id"], "status": row["status"], "signal_count": count,
                          "reason_codes": _reasons(row.get("reason_codes", row.get("reasons", [])))})
    if len({row["strategy_id"] for row in projected}) != len(STRATEGIES):
        return [], ["per_symbol_strategy_inventory_duplicate"]
    return sorted(projected, key=lambda row: row["strategy_id"]), []


def _report_metadata(report_evidence, symbol, cutoff):
    if report_evidence is None:
        return {"status": "not_supplied", "records": [], "sources": []}
    if not isinstance(report_evidence, dict) or report_evidence.get("schema_version") != "broker-report-evaluation-v1":
        return {"status": "unsupported_metadata", "records": [], "sources": []}
    report_cutoff = _timestamp(report_evidence.get("cutoff"))
    if cutoff is None or report_cutoff is None or report_cutoff > cutoff:
        return {"status": "cutoff_unverified_or_future", "records": [], "sources": []}
    rows = report_evidence.get("records", [])
    events = report_evidence.get("metadata_events", [])
    if not isinstance(rows, list) or not isinstance(events, list) or max(len(rows), len(events)) > 10000:
        return {"status": "metadata_bound_or_shape_invalid", "records": [], "sources": []}
    records = [{"event_id": row["event_id"], "status": row["status"], "reason_codes": _reasons(row.get("reasons"))}
               for row in rows if isinstance(row, dict) and row.get("symbol") == symbol
               and _text(row.get("event_id")) and row.get("status") in {"evaluated", "metadata_only", "superseded", "retracted", "retraction", "duplicate"}]
    ids = {row["event_id"] for row in records}
    sources = set()
    for event in events:
        if not isinstance(event, dict) or event.get("symbol") != symbol or event.get("event_id") not in ids:
            continue
        clocks = [_timestamp(event.get(key)) for key in ["first_seen_at", "recorded_at"]]
        for key in ["report_published_at", "article_published_at", "source_available_at"]:
            if event.get(key) is not None:
                clocks.append(_timestamp(event[key]))
        if any(value is None or value > cutoff for value in clocks):
            continue
        url = event.get("source_url")
        if _text(url, 2048):
            try:
                parts = urlsplit(url)
                if parts.scheme == "https" and parts.hostname and not parts.username and not parts.password:
                    sources.add(url)
            except ValueError:
                pass
    # No report body, extracted prose, price target or portfolio return is copied.
    return {"status": "supplied_metadata_only", "records": sorted(records, key=_canonical), "sources": sorted(sources),
            "cutoff": report_evidence["cutoff"], "strategy_promotion": False}


def _markdown(article):
    lines = [f"# {_escape(article['symbol'])} {_escape(article['name'] or '名稱缺漏')}｜歷史策略研究草稿", "",
             f"草稿狀態：`{article['status']}`。僅供離線審閱，尚未更新正式文章。", "",
             "這是固定存續股票樣本的歷史探索，不是目前進場點、個人持倉或可交易建議。",
             f"候選快照時間：{_escape(article['snapshot_as_of'] or '缺漏')}；候選版本：{_escape(article['candidate_revision'] or '缺漏')}。", ""]
    observation = article.get("public_observation")
    if observation:
        lines += [f"此候選輸入是有限公開頁面觀測，非完整候選匯出。來源內容日期：{_escape(observation['source_content_as_of'] or '未知')}；"
                  f"實際觀察時間：{_escape(observation['observed_at'] or '未知')}。",
                  "觀察時間不是內容更新時間；公開舊投影不能證明今日股票狀態、完整名單或正式資料權威。", ""]
    context = article["historical_research"]
    if context:
        lines += [f"研究期間：{context['period']['start']} 至 {context['period']['end']}。2024 年以後的保留資料未納入本輪研究。",
                  f"資料識別：`{context['dataset_hash']}`。共用投資組合報告識別：`{context['artifact_hash']}`。",
                  "整體投資組合績效屬共用研究，不能視為本股獨立報酬。本稿不複製整體績效為個股數字。", ""]
    else:
        lines += ["尚無符合本輪契約的研究報告；不補造歷史績效或目前價格。", ""]
    if article["strategy_coverage"]:
        lines += ["| 假說 | 本股處理狀態 | 訊號數 |", "|---|---|---|"]
        for row in article["strategy_coverage"]:
            lines.append(f"| {row['strategy_id']} | {row['status']} | {row['signal_count'] if row['signal_count'] is not None else '未提供'} |")
        lines += ["", "訊號數與處理狀態不是成交數、勝率或獨立個股績效。S5／S7 的事件證據缺口仍保留。", ""]
        if any(row.get("evidence_source") == "missing_or_invalid_input" for row in article["strategy_coverage"]):
            lines += ["上述缺件狀態由草稿產生器標示，表示尚未取得本股有效研究；不代表已完成七項回測。", ""]
    else:
        lines += ["本股逐策略結果仍待提供；共用組合研究不替代個股評估。", ""]
    if article["reason_codes"]:
        lines += ["阻擋原因：" + "、".join(f"`{reason}`" for reason in article["reason_codes"]) + "。", ""]
    report = article["report_evidence"]
    lines += [f"券商／報告資料狀態：`{report['status']}`。僅列提供的來源中繼資料，不將其升格為策略資格或重製報告內文。"]
    for source in report["sources"]:
        lines.append("- 來源：" + _escape(source))
    lines += ["", "目前正式研究、交易資格與發布狀態須另由既有受保護流程查證；本草稿沒有正式發布收據。", ""]
    return "\n".join(lines)


def build_articles(snapshot: dict, research: dict | None = None, report_evidence: dict | None = None) -> dict:
    if not isinstance(snapshot, dict):
        raise ValueError("candidate_snapshot_not_object")
    # Canonicalization also refuses NaN, Infinity and non-JSON inputs.
    for value in [snapshot, research, report_evidence]:
        if len(_canonical(value).encode("utf-8")) > MAX_INPUT_BYTES:
            raise ValueError("article_input_bound_exceeded")
    rows = snapshot.get("candidates")
    if rows is None:
        rows = []
    if not isinstance(rows, list) or len(rows) > MAX_CANDIDATES:
        raise ValueError("candidate_roster_shape_or_bound_invalid")
    global_reasons = []
    if "candidates" not in snapshot or snapshot["candidates"] is None:
        global_reasons.append("snapshot_candidates_missing")
    if not _text(snapshot.get("schema_version"), 128):
        global_reasons.append("snapshot_schema_missing")
    if not _text(snapshot.get("revision")):
        global_reasons.append("snapshot_revision_missing")
    cutoff = _timestamp(snapshot.get("as_of"))
    if cutoff is None:
        global_reasons.append("snapshot_cutoff_invalid")
    if snapshot.get("complete") is not True:
        global_reasons.append("snapshot_not_complete")
    expected = snapshot.get("expected_count")
    if type(expected) is not int or expected < 0 or expected != len(rows):
        global_reasons.append("snapshot_expected_count_mismatch")
    context, research_reasons = _research_context(research)
    global_reasons.extend(research_reasons)
    candidates = {}; invalid_indexes = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or not _symbol(row.get("symbol")):
            invalid_indexes.append(index)
            continue
        if row["symbol"] in candidates:
            raise ValueError(f"duplicate_candidate_symbol:{row['symbol']}")
        candidates[row["symbol"]] = row
    if invalid_indexes:
        global_reasons.append("candidate_invalid_identity_rows")
    articles = []; queue = []
    for symbol, row in sorted(candidates.items()):
        reasons = list(global_reasons)
        for key in ["name", "revision", "authority_ref"]:
            if not _text(row.get(key)):
                reasons.append(f"candidate_{key}_missing")
        if row.get("security_type") != "common_stock":
            reasons.append("candidate_not_common_stock")
        if row.get("exchange") not in {"TWSE", "TPEX"}:
            reasons.append("candidate_exchange_invalid")
        if row.get("available_at") is not None:
            available = _timestamp(row["available_at"])
            if available is None or cutoff is None or available > cutoff:
                reasons.append("candidate_availability_unverified_or_future")
        coverage, coverage_reasons = _symbol_coverage(research, symbol)
        reasons.extend(coverage_reasons)
        if not coverage:
            coverage = [{"strategy_id": strategy, "status": "blocked", "signal_count": None,
                         "reason_codes": list(coverage_reasons), "evidence_source": "missing_or_invalid_input"}
                        for strategy in STRATEGIES]
        article = {"symbol": symbol, "name": row.get("name") if _text(row.get("name")) else None,
                   "candidate_revision": row.get("revision") if _text(row.get("revision")) else None,
                   "authority_ref": row.get("authority_ref") if _text(row.get("authority_ref")) else None,
                   "snapshot_revision": snapshot.get("revision") if _text(snapshot.get("revision")) else None,
                   "snapshot_as_of": snapshot.get("as_of") if cutoff else None,
                   "status": "blocked" if reasons else "preview_ready", "reason_codes": sorted(set(reasons)),
                   "research_freshness": "historical_research_not_current_entry_plan", "historical_research": context,
                   "strategy_coverage": coverage, "per_symbol_performance": None,
                   "report_evidence": _report_metadata(report_evidence, symbol, cutoff),
                   "production_eligibility": "not_evaluated", "published": False}
        if snapshot.get("scope") == "bounded_public_card_observation_only":
            article["public_observation"] = {
                "source_content_as_of": snapshot.get("source_content_as_of") if _day(snapshot.get("source_content_as_of")) else None,
                "observed_at": row.get("observed_at") if _timestamp(row.get("observed_at")) else None,
                "authoritative_snapshot_available": False,
            }
        article["markdown"] = _markdown(article)
        article["article_hash"] = hashlib.sha256(article["markdown"].encode("utf-8")).hexdigest()
        articles.append(article)
        queue.append({"symbol": symbol, "draft_path": f"{symbol}.md", "article_hash": article["article_hash"],
                      "status": article["status"], "reason_codes": article["reason_codes"], "dry_run": True,
                      "snapshot_revision": article["snapshot_revision"], "expected_candidate_revision": article["candidate_revision"],
                      "current_candidate_revision": None, "current_revision_status": "not_read_offline",
                      "publish_allowed": False, "publication_receipt": None})
    ready = sum(row["status"] == "preview_ready" for row in articles)
    roster_complete = not any(reason.startswith(("snapshot_", "candidate_invalid")) for reason in global_reasons)
    coverage = {"input_count": len(rows), "expected_count": expected if type(expected) is int else None,
                "valid_unique_candidate_count": len(candidates), "invalid_row_indexes": invalid_indexes,
                "article_count": len(articles), "queue_count": len(queue), "preview_ready_count": ready,
                "blocked_count": len(articles) - ready, "all_valid_candidates_accounted_for": len(articles) == len(candidates) == len(queue),
                "complete_snapshot_accounted_for": roster_complete and not invalid_indexes,
                "full_app_coverage_verified": False, "global_reason_codes": sorted(set(global_reasons)),
                "production_updated": False}
    return {"schema_version": SCHEMA_VERSION, "validation_status": "research_only", "dry_run": True,
            "snapshot_hash": _hash(snapshot), "research_reference": context, "coverage": coverage,
            "articles": articles, "update_queue": queue}


def _read(path):
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("article_input_bound_exceeded")
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"nonfinite_json:{value}")))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--research", type=Path)
    parser.add_argument("--reports", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    result = build_articles(_read(args.snapshot), _read(args.research) if args.research else None,
                            _read(args.reports) if args.reports else None)
    # Never replace a previous run or write through an existing output symlink.
    args.output_dir.mkdir(parents=True, exist_ok=False)
    for article in result["articles"]:
        with (args.output_dir / f"{article['symbol']}.md").open("x", encoding="utf-8") as file:
            file.write(article["markdown"])
    files = {"coverage.json": {key: value for key, value in result.items() if key not in {"articles", "update_queue"}},
             "update-queue.json": {"schema_version": SCHEMA_VERSION, "dry_run": True, "snapshot_hash": result["snapshot_hash"], "entries": result["update_queue"]}}
    for name, value in files.items():
        with (args.output_dir / name).open("x", encoding="utf-8") as file:
            file.write(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n")
    print(json.dumps(result["coverage"], ensure_ascii=False, sort_keys=True, allow_nan=False))
    return result


if __name__ == "__main__":
    main()

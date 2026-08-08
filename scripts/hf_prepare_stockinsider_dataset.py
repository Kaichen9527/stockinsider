#!/usr/bin/env python3
"""Prepare StockInsider JSONL datasets for local Hugging Face fine-tuning.

The script intentionally does not make buy/sell labels. It prepares assistive
tasks only: sentiment, evidence strength, symbol extraction, and theme extraction.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any, Iterable
from urllib import request


DEFAULT_OUTPUT = Path(".agent/datasets/stockinsider-hf-signals.jsonl")
TW_SYMBOL_RE = re.compile(r"\b([1-9]\d{3})\b")


def compact(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def infer_sentiment(text: str) -> str:
    bullish = ["調升", "買進", "上修", "看好", "受惠", "漲價", "轉強", "突破", "優於"]
    bearish = ["調降", "賣出", "下修", "衰退", "不如預期", "轉弱", "跌破", "減碼"]
    score = sum(word in text for word in bullish) - sum(word in text for word in bearish)
    if score > 0:
        return "bullish"
    if score < 0:
        return "bearish"
    return "neutral"


def infer_evidence_strength(row: dict[str, Any]) -> str:
    platform = compact(row.get("platform")).lower()
    if platform in {"official", "financial", "twse_insider"}:
        return "high"
    if platform in {"broker_report", "public_research", "anue", "moneydj", "udn"}:
        return "medium"
    return "low"


def symbols_from_text(text: str) -> list[str]:
    return sorted(set(TW_SYMBOL_RE.findall(text)))


def rows_from_local_json(path: Path) -> Iterable[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        yield from data
    elif isinstance(data, dict):
        for key in ("data", "rows", "items"):
            if isinstance(data.get(key), list):
                yield from data[key]
                return


def rows_from_supabase(limit: int) -> Iterable[dict[str, Any]]:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )
    if not url or not key:
        return []
    endpoint = f"{url.rstrip('/')}/rest/v1/source_raw_documents?select=*&order=collected_at.desc&limit={limit}"
    req = request.Request(endpoint, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with request.urlopen(req, timeout=30) as res:  # nosec - operator-provided URL/env
        return json.loads(res.read().decode("utf-8"))


def to_training_record(row: dict[str, Any]) -> dict[str, Any] | None:
    text = compact(" ".join([
        compact(row.get("title")),
        compact(row.get("summary")),
        compact(row.get("content_text")),
        compact(row.get("raw_text")),
    ]))
    if len(text) < 12:
        return None
    symbols = row.get("symbols") if isinstance(row.get("symbols"), list) else symbols_from_text(text)
    return {
        "text": text[:4000],
        "source_id": row.get("id") or row.get("document_url") or row.get("file_path"),
        "source_type": row.get("platform") or row.get("source_type") or "unknown",
        "published_at": row.get("published_at") or row.get("collected_at") or row.get("report_date"),
        "symbols": symbols,
        "sentiment_label": row.get("sentiment_label") or infer_sentiment(text),
        "evidence_strength_label": infer_evidence_strength(row),
        "supports_base": infer_evidence_strength(row) == "high",
        "scenario_only": infer_evidence_strength(row) != "high",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, help="Optional exported JSON/JSONL source rows")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=1000)
    args = parser.parse_args()

    if args.input:
        rows = list(rows_from_local_json(args.input))
    else:
        rows = list(rows_from_supabase(args.limit))

    records = [record for row in rows if (record := to_training_record(row))]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(json.dumps({"output": str(args.output), "records": len(records)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

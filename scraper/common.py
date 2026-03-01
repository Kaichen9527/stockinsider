import os
import datetime as dt
from typing import Dict, Any, Optional, TYPE_CHECKING, Tuple

from dotenv import load_dotenv

if TYPE_CHECKING:
    from supabase import Client

load_dotenv(dotenv_path="../.env")

FRESHNESS_THRESHOLD_SECONDS = int(os.environ.get("SIGNAL_FRESHNESS_THRESHOLD_SECONDS", "3600"))


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def parse_iso_to_utc(value: str) -> dt.datetime:
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def freshness_status(source_timestamp: dt.datetime, now: Optional[dt.datetime] = None) -> str:
    current = now or utc_now()
    delta = (current - source_timestamp).total_seconds()
    if delta <= FRESHNESS_THRESHOLD_SECONDS:
        return "fresh"
    return "stale"


def get_supabase_client() -> 'Client':
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def ensure_stock(client: 'Client', symbol: str, market: str, name: Optional[str] = None, sector: Optional[str] = None) -> Dict[str, Any]:
    query = client.table("stocks").select("id,symbol,market,name,sector").eq("symbol", symbol).eq("market", market).limit(1).execute()
    if query.data:
        return query.data[0]

    payload = {
        "symbol": symbol,
        "market": market,
        "name": name or f"Stock {symbol}",
        "sector": sector,
    }
    created = client.table("stocks").insert(payload).execute()
    return created.data[0]


def start_pipeline_run(client: 'Client', run_type: str, details: Dict[str, Any]) -> str:
    inserted = client.table("pipeline_runs").insert(
        {
            "run_type": run_type,
            "status": "running",
            "details": details,
        }
    ).execute()
    return inserted.data[0]["id"]


def finish_pipeline_run(client: 'Client', run_id: str, status: str, details: Optional[Dict[str, Any]] = None) -> None:
    payload: Dict[str, Any] = {
        "status": status,
        "finished_at": utc_now().isoformat(),
    }
    if details is not None:
        payload["details"] = details

    client.table("pipeline_runs").update(payload).eq("id", run_id).execute()


def upsert_source_registry(
    client: 'Client',
    source_key: str,
    source_type: str,
    *,
    status: str = "active",
    risk_level: str = "low",
    added_by: str = "system",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = {
        "source_key": source_key,
        "source_type": source_type,
        "status": status,
        "risk_level": risk_level,
        "added_by": added_by,
        "metadata": metadata or {},
        "updated_at": utc_now().isoformat(),
    }
    res = (
        client.table("source_registry")
        .upsert(payload, on_conflict="source_key")
        .execute()
    )
    return res.data[0]


def get_source_status(client: 'Client', source_key: str) -> Optional[Dict[str, Any]]:
    res = (
        client.table("source_registry")
        .select("*")
        .eq("source_key", source_key)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def enqueue_source_review(
    client: 'Client',
    source_key: str,
    reason: str,
    evidence: Optional[Dict[str, Any]] = None,
) -> None:
    client.table("source_review_queue").insert(
        {
            "source_key": source_key,
            "reason": reason,
            "evidence": evidence or {},
            "state": "pending",
        }
    ).execute()


def record_source_health(
    client: 'Client',
    source_key: str,
    *,
    latency_ms: Optional[int],
    parse_success_ratio: float,
    freshness_pass_rate: float,
    error_summary: Optional[str] = None,
) -> None:
    client.table("source_health_checks").insert(
        {
            "source_key": source_key,
            "latency_ms": latency_ms,
            "parse_success_ratio": parse_success_ratio,
            "freshness_pass_rate": freshness_pass_rate,
            "error_summary": error_summary,
        }
    ).execute()


def source_allowed(
    client: 'Client',
    source_key: str,
    source_type: str,
    *,
    confidence: Optional[float] = None,
    parse_success_ratio: Optional[float] = None,
) -> Tuple[bool, Optional[str]]:
    row = get_source_status(client, source_key)
    if row is None:
        upsert_source_registry(client, source_key, source_type, status="active", risk_level="medium", metadata={"auto_discovered": True})
        row = get_source_status(client, source_key)

    if row and row.get("status") == "blocked":
        return False, "source blocked by governance"

    min_conf = float(os.environ.get("SOURCE_MIN_CONFIDENCE", "0.45"))
    min_parse = float(os.environ.get("SOURCE_MIN_PARSE_SUCCESS_RATIO", "0.6"))
    if confidence is not None and confidence < min_conf:
        upsert_source_registry(client, source_key, source_type, status="blocked", risk_level="high", metadata={"trigger": "low_confidence", "confidence": confidence})
        enqueue_source_review(client, source_key, "low confidence", {"confidence": confidence, "threshold": min_conf})
        return False, "source confidence below threshold"

    if parse_success_ratio is not None and parse_success_ratio < min_parse:
        upsert_source_registry(client, source_key, source_type, status="blocked", risk_level="high", metadata={"trigger": "low_parse_success", "parse_success_ratio": parse_success_ratio})
        enqueue_source_review(client, source_key, "low parse success ratio", {"parse_success_ratio": parse_success_ratio, "threshold": min_parse})
        return False, "source parse success below threshold"

    return True, None

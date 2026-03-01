from __future__ import annotations

import datetime as dt
from typing import Dict, Any, List, Tuple

from common import get_supabase_client, start_pipeline_run, finish_pipeline_run, utc_now


def _iso(ts: dt.datetime) -> str:
    return ts.astimezone(dt.timezone.utc).isoformat()


def _allowed(subscription: Dict[str, Any], event_type: str) -> bool:
    prefs = subscription.get("event_preferences") or {}
    digest_enabled = bool(subscription.get("digest_enabled", True))

    if event_type == "daily_digest":
        return digest_enabled and bool(prefs.get("daily_digest", True))

    return bool(prefs.get(event_type, True))


def _render_message(event: Dict[str, Any]) -> str:
    payload = event.get("payload") or {}
    event_type = event.get("event_type")

    if event_type == "daily_digest":
        rows = payload.get("top_recommendations", [])
        lines = ["StockInsider 每日摘要"]
        for row in rows[:5]:
            lines.append(
                f"- {row.get('symbol')} {row.get('action')} score={row.get('score')} conf={row.get('confidence')}"
            )
        return "\n".join(lines)

    return (
        f"StockInsider 事件提醒\n"
        f"symbol={payload.get('symbol')}\n"
        f"event={payload.get('event')}\n"
        f"price={payload.get('price')}\n"
        f"target={payload.get('target_price')} stop={payload.get('stop_loss')}"
    )


def dispatch_pending_events() -> Dict[str, int]:
    client = get_supabase_client()
    run_id = start_pipeline_run(client, "line_dispatch", {"step": "started"})

    pending = (
        client.table("line_alert_events")
        .select("id,event_type,payload,strategy_action_id")
        .eq("delivery_status", "pending")
        .order("created_at", desc=False)
        .limit(200)
        .execute()
    )

    subscriptions = client.table("line_subscriptions").select("*").execute().data or []
    now = utc_now()
    sent = 0
    skipped = 0

    try:
        for event in pending.data or []:
            delivered_to = 0
            for sub in subscriptions:
                if not _allowed(sub, event["event_type"]):
                    continue

                message = _render_message(event)
                # In v1 this is persisted delivery simulation. Replace with LINE push API in production.
                client.table("pipeline_runs").insert(
                    {
                        "run_type": "line_dispatch",
                        "status": "success",
                        "details": {
                            "line_user_id": sub.get("line_user_id"),
                            "event_id": event["id"],
                            "message_preview": message[:120],
                        },
                    }
                ).execute()
                delivered_to += 1

            if delivered_to > 0:
                client.table("line_alert_events").update(
                    {"delivery_status": "sent", "sent_at": _iso(now)}
                ).eq("id", event["id"]).execute()
                sent += 1
            else:
                client.table("line_alert_events").update(
                    {"delivery_status": "skipped", "sent_at": _iso(now)}
                ).eq("id", event["id"]).execute()
                skipped += 1

        summary = {"sent": sent, "skipped": skipped}
        finish_pipeline_run(client, run_id, "success", summary)
        return summary
    except Exception as exc:
        finish_pipeline_run(client, run_id, "failed", {"error": str(exc)})
        raise


if __name__ == "__main__":
    print(dispatch_pending_events())

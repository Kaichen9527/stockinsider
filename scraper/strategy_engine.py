from __future__ import annotations

import datetime as dt
from typing import Dict, Any, List, Optional, Tuple

from common import get_supabase_client, utc_now, start_pipeline_run, finish_pipeline_run

MARKET_WEIGHT = 0.25
INSTITUTIONAL_WEIGHT = 0.35
SOCIAL_WEIGHT = 0.20
TECHNICAL_WEIGHT = 0.20


def _iso(ts: dt.datetime) -> str:
    return ts.astimezone(dt.timezone.utc).isoformat()


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    if value is None:
        return fallback
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _compute_technical_score(signal: Dict[str, Any]) -> float:
    score = 0.0
    price = _safe_float(signal.get("price"))
    ma_short = _safe_float(signal.get("ma_short"), price)
    ma_mid = _safe_float(signal.get("ma_mid"), price)
    rsi = _safe_float(signal.get("rsi"), 50.0)
    macd = _safe_float(signal.get("macd"))
    macd_signal = _safe_float(signal.get("macd_signal"))

    if price >= ma_short:
        score += 0.35
    if ma_short >= ma_mid:
        score += 0.25
    if 45.0 <= rsi <= 70.0:
        score += 0.2
    if macd >= macd_signal:
        score += 0.2

    return min(score, 1.0)


def _compute_social_score(rows: List[Dict[str, Any]]) -> float:
    if not rows:
        return 0.5

    source_weight = {
        "PTT": 0.3,
        "Threads": 0.2,
        "KOL": 0.5,
    }
    sentiment_weight = {
        "bullish": 1.0,
        "neutral": 0.5,
        "bearish": 0.0,
    }

    weighted = 0.0
    total = 0.0
    for row in rows:
        src = row.get("source_type", "PTT")
        confidence = _safe_float(row.get("confidence"), 0.5)
        base = source_weight.get(src, 0.2) * confidence
        signal = sentiment_weight.get(row.get("sentiment_label"), 0.5)
        weighted += base * signal
        total += base

    if total == 0:
        return 0.5
    return max(0.0, min(1.0, weighted / total))


def _compute_market_score(snapshot: Optional[Dict[str, Any]], market: str) -> float:
    if not snapshot:
        return 0.45

    index_state = snapshot.get("index_state") or {}
    trend_score = _safe_float(index_state.get("trend_score"), 0.5)
    if market == "US":
        trend_score *= 0.9
    return max(0.0, min(1.0, trend_score))


def _confidence_from_parts(*parts: float) -> float:
    if not parts:
        return 0.0
    avg = sum(parts) / len(parts)
    variance = sum((x - avg) ** 2 for x in parts) / len(parts)
    confidence = avg * (1.0 - min(variance, 0.4))
    return round(max(0.0, min(1.0, confidence)), 4)


def _map_action(score: float) -> str:
    if score >= 0.7:
        return "buy"
    if score >= 0.5:
        return "watch"
    return "reduce"


def _position_rule(action: str, market: str) -> str:
    if action == "buy":
        return "TW: 10-20% portfolio" if market == "TW" else "US: 5-10% portfolio"
    if action == "watch":
        return "Observe pullback and confirm trend before adding"
    return "Trim to defensive allocation"


def _build_entry_rule(signal: Dict[str, Any], action: str) -> str:
    price = _safe_float(signal.get("price"))
    ma_short = _safe_float(signal.get("ma_short"), price)
    if action == "buy":
        return f"Buy on hold above MA5 ({ma_short:.2f}) with stable volume"
    if action == "watch":
        return "Wait for momentum confirmation (MACD crossover + RSI support)"
    return "Avoid new entries until trend recovers"


def _calc_target_stop(price: float, action: str) -> Tuple[Optional[float], Optional[float], str]:
    if action == "buy":
        return round(price * 1.12, 2), round(price * 0.92, 2), "7-14 days"
    if action == "watch":
        return round(price * 1.06, 2), round(price * 0.95, 2), "3-7 days"
    return round(price * 0.98, 2), round(price * 0.9, 2), "1-3 days"


def _latest_stock_signals(client) -> List[Dict[str, Any]]:
    response = client.table("stock_signals").select("*,stocks(id,symbol,market,name)").order("as_of", desc=True).limit(200).execute()
    latest: Dict[str, Dict[str, Any]] = {}
    for row in response.data:
        stock = row.get("stocks")
        if not stock:
            continue
        stock_id = stock["id"]
        if stock_id not in latest:
            latest[stock_id] = row
    return list(latest.values())


def _latest_market_snapshots(client) -> Dict[str, Dict[str, Any]]:
    response = client.table("market_snapshots").select("*").order("as_of", desc=True).limit(20).execute()
    latest: Dict[str, Dict[str, Any]] = {}
    for row in response.data:
        market = row["market"]
        if market not in latest:
            latest[market] = row
    return latest


def _latest_institutional_score(client, stock_id: str) -> float:
    response = (
        client.table("institutional_signals")
        .select("expectation_score")
        .eq("stock_id", stock_id)
        .order("source_timestamp", desc=True)
        .limit(5)
        .execute()
    )
    if not response.data:
        return 0.5
    values = [_safe_float(x["expectation_score"], 0.5) for x in response.data]
    return max(0.0, min(1.0, sum(values) / len(values)))


def _latest_social_rows(client, stock_id: str) -> List[Dict[str, Any]]:
    response = (
        client.table("social_signals")
        .select("source_type,sentiment_label,confidence")
        .eq("stock_id", stock_id)
        .order("source_timestamp", desc=True)
        .limit(30)
        .execute()
    )
    return response.data or []


def _is_stock_blocked(signal: Dict[str, Any], market_snapshot: Optional[Dict[str, Any]]) -> Tuple[bool, Optional[str]]:
    if signal.get("freshness_status") != "fresh":
        return True, "stock signal stale"
    if not market_snapshot or market_snapshot.get("freshness_status") != "fresh":
        return True, "market snapshot stale"
    return False, None


def generate_recommendations() -> Dict[str, Any]:
    client = get_supabase_client()
    run_id = start_pipeline_run(client, "recommendation", {"step": "started"})
    now = utc_now()
    as_of = now.date().isoformat()

    created_count = 0
    blocked_count = 0
    snapshots = _latest_market_snapshots(client)
    signals = _latest_stock_signals(client)

    try:
        for signal in signals:
            stock = signal["stocks"]
            stock_id = stock["id"]
            market = stock["market"]
            market_snapshot = snapshots.get(market)
            blocked, block_reason = _is_stock_blocked(signal, market_snapshot)

            market_score = _compute_market_score(market_snapshot, market)
            institutional_score = _latest_institutional_score(client, stock_id)
            social_score = _compute_social_score(_latest_social_rows(client, stock_id))
            technical_score = _compute_technical_score(signal)

            total_score = (
                market_score * MARKET_WEIGHT
                + institutional_score * INSTITUTIONAL_WEIGHT
                + social_score * SOCIAL_WEIGHT
                + technical_score * TECHNICAL_WEIGHT
            )
            confidence = _confidence_from_parts(market_score, institutional_score, social_score, technical_score)

            action = _map_action(total_score)
            scope = "TW_PRIMARY" if market == "TW" else "US_SECONDARY"
            rationale = (
                f"market={market_score:.2f}, institutional={institutional_score:.2f}, "
                f"social={social_score:.2f}, technical={technical_score:.2f}"
            )

            recommendation = client.table("recommendations").upsert(
                {
                    "stock_id": stock_id,
                    "as_of": as_of,
                    "market_scope": scope,
                    "score": round(total_score, 4),
                    "confidence": confidence,
                    "action": action,
                    "rationale": rationale,
                    "signal_breakdown": {
                        "market": market_score,
                        "institutional": institutional_score,
                        "social": social_score,
                        "technical": technical_score,
                    },
                    "published_at": None if blocked else _iso(now),
                    "is_blocked": blocked,
                    "block_reason": block_reason,
                },
                on_conflict="stock_id,as_of",
            ).execute()

            recommendation_id = recommendation.data[0]["id"]
            price = _safe_float(signal.get("price"), 0.0)
            target_price, stop_loss, horizon = _calc_target_stop(price, action)
            client.table("strategy_actions").upsert(
                {
                    "recommendation_id": recommendation_id,
                    "entry_rule": _build_entry_rule(signal, action),
                    "position_size_rule": _position_rule(action, market),
                    "target_price": target_price,
                    "stop_loss": stop_loss,
                    "review_horizon": horizon,
                    "state": "active" if action != "reduce" else "invalidated",
                    "state_changed_at": _iso(now),
                    "updated_at": _iso(now),
                },
                on_conflict="recommendation_id",
            ).execute()

            if blocked:
                blocked_count += 1
            created_count += 1

        summary = {"recommendations": created_count, "blocked": blocked_count}
        finish_pipeline_run(client, run_id, "success", summary)
        return summary
    except Exception as exc:
        finish_pipeline_run(client, run_id, "failed", {"error": str(exc)})
        raise


def evaluate_strategy_transitions() -> Dict[str, Any]:
    client = get_supabase_client()
    run_id = start_pipeline_run(client, "recommendation", {"step": "evaluate_transitions"})
    now = utc_now()

    query = (
        client.table("strategy_actions")
        .select("id,state,target_price,stop_loss,recommendations(id,stock_id,as_of,stocks(symbol),score),recommendation_id")
        .in_("state", ["active", "hit_target", "hit_stop_loss"])
        .execute()
    )

    changed = 0
    for row in query.data:
        recommendation = row.get("recommendations") or {}
        stock_id = recommendation.get("stock_id")
        if not stock_id:
            continue

        signal_res = (
            client.table("stock_signals")
            .select("price")
            .eq("stock_id", stock_id)
            .order("as_of", desc=True)
            .limit(1)
            .execute()
        )
        if not signal_res.data:
            continue

        price = _safe_float(signal_res.data[0].get("price"))
        state = row["state"]
        target = _safe_float(row.get("target_price"), -1)
        stop_loss = _safe_float(row.get("stop_loss"), -1)

        new_state: Optional[str] = None
        event_type: Optional[str] = None
        if target > 0 and price >= target and state != "hit_target":
            new_state = "hit_target"
            event_type = "hit_target"
        elif stop_loss > 0 and price <= stop_loss and state != "hit_stop_loss":
            new_state = "hit_stop_loss"
            event_type = "hit_stop_loss"

        if not new_state:
            continue

        client.table("strategy_actions").update(
            {
                "state": new_state,
                "state_changed_at": _iso(now),
                "updated_at": _iso(now),
            }
        ).eq("id", row["id"]).execute()

        symbol = ((recommendation.get("stocks") or {}).get("symbol") or "UNKNOWN")
        payload = {
            "symbol": symbol,
            "event": event_type,
            "price": price,
            "target_price": target,
            "stop_loss": stop_loss,
            "recommendation_score": recommendation.get("score"),
            "triggered_at": _iso(now),
        }
        client.table("line_alert_events").insert(
            {
                "strategy_action_id": row["id"],
                "event_type": event_type,
                "payload": payload,
                "delivery_status": "pending",
            }
        ).execute()
        changed += 1

    finish_pipeline_run(client, run_id, "success", {"state_changes": changed})
    return {"state_changes": changed}


def create_daily_digest_events() -> int:
    client = get_supabase_client()
    today = utc_now().date().isoformat()
    recommendations = (
        client.table("recommendations")
        .select("id,score,action,confidence,rationale,stocks(symbol,name)")
        .eq("as_of", today)
        .eq("is_blocked", False)
        .order("score", desc=True)
        .limit(10)
        .execute()
    )

    if not recommendations.data:
        return 0

    top_rows = []
    for item in recommendations.data:
        stock = item.get("stocks") or {}
        top_rows.append(
            {
                "symbol": stock.get("symbol"),
                "name": stock.get("name"),
                "score": item.get("score"),
                "action": item.get("action"),
                "confidence": item.get("confidence"),
            }
        )

    created = 0
    for recommendation in recommendations.data:
        strategy = (
            client.table("strategy_actions")
            .select("id")
            .eq("recommendation_id", recommendation["id"])
            .limit(1)
            .execute()
        )
        if not strategy.data:
            continue

        client.table("line_alert_events").insert(
            {
                "strategy_action_id": strategy.data[0]["id"],
                "event_type": "daily_digest",
                "payload": {
                    "digest_date": today,
                    "top_recommendations": top_rows,
                },
                "delivery_status": "pending",
            }
        ).execute()
        created += 1

    return created


def run_daily_recommendation_flow() -> Dict[str, Any]:
    generate = generate_recommendations()
    transitions = evaluate_strategy_transitions()
    digest = create_daily_digest_events()
    return {
        "generate": generate,
        "transitions": transitions,
        "digest_events": digest,
    }


if __name__ == "__main__":
    print(run_daily_recommendation_flow())

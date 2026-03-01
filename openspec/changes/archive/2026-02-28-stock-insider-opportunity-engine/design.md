## Context

The project has a working MVP scaffold (Next.js + Supabase + Python jobs + LINE webhook) but lacked decision-complete boundaries. This design formalizes a TW-primary, US-secondary system with deterministic daily outputs, strict freshness control, and explainable strategy actions.

## Goals / Non-Goals

**Goals:**
- Build a reliable daily batch pipeline: ingest -> normalize -> score -> strategy -> notify.
- Use rule-based scoring + confidence for explainability and reproducibility.
- Enforce critical data freshness: stale (>1 hour) critical signals block publish.
- Deliver dashboard, stock detail, and LINE outputs from one canonical state.

**Non-Goals:**
- Auto-trading execution.
- Tick-level real-time stream processing.
- Paid/private institutional report ingestion in v1.

## Decisions

- **Decision: TW primary, US secondary scope.**
  Rationale: maximize early product signal on target user base while preserving US pipeline compatibility.
  Alternatives considered: equal scope for TW/US (longer time-to-value), TW-only (less extensible).

- **Decision: Rule-based strategy + confidence score.**
  Rationale: transparent output for users and easier testability.
  Alternatives considered: opaque ML-only score (lower explainability in v1).

- **Decision: MA/RSI/MACD mandatory indicator set in v1.**
  Rationale: practical balance between signal quality and implementation complexity.
  Alternatives considered: MA only (too weak), full advanced bundle (too heavy).

- **Decision: One-hour freshness gate.**
  Rationale: daily recommendation should not publish on stale critical signals.
  Alternatives considered: 4h/24h thresholds (weaker freshness guarantee).

- **Decision: Social source reliability weighting.**
  Rationale: reduce noise manipulation from any single source.
  Alternatives considered: equal weighting (higher noise impact).

- **Decision: LINE dual-track notifications.**
  Rationale: event-triggered timing + digest completeness gives better user value and retention.
  Alternatives considered: event-only or digest-only.

## Risks / Trade-offs

- [Risk] Public source format drift breaks ingestion. -> Mitigation: adapter isolation + retries + pipeline run logs.
- [Risk] Social sentiment volatility distorts score. -> Mitigation: confidence + source-weighted aggregation.
- [Risk] Over-notification causes fatigue. -> Mitigation: preference filters + throttle settings + digest toggle.
- [Risk] Freshness gate blocks too often on unstable sources. -> Mitigation: explicit block reason + scope-specific fallback.

## Migration Plan

1. Expand schema via versioned SQL migration and shared apply flow.
2. Introduce canonical ingestion adapters with source timestamps and freshness status.
3. Implement scoring + strategy lifecycle + alert event generation.
4. Replace frontend mock data with API/DB-backed views.
5. Add LINE subscription binding and dispatcher.
6. Add smoke/integration tests and runbook for scheduled operations.

## Open Questions

- Which additional public institutional sources should be added after v1 stability?
- Should position sizing become risk-profile aware in v1.1?
- What auto-remediation policy should run when freshness gate blocks consecutive days?

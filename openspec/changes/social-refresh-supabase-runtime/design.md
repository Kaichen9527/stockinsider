## Runtime Model

The local Mac launchd worker remains the only canonical executor for browser-based connectors. Vercel API routes may accept status-only calls, but they must not overwrite successful local worker state or invalidate credentials.

The new job `social-source-refresh-6h` runs a complete social sweep:

1. Threads session health.
2. Threads symbol/theme search when the session is valid.
3. InvestAnchors symbol/theme refresh.
4. Instagram source sync.
5. Telegram public-channel refresh.
6. Podcast sync/transcribe.
7. Source discovery, story scan, story verify, affected-symbol stock research refresh, and bridge snapshot rebuild.

The job is due once per `Asia/Taipei` slot: `00:00`, `06:00`, `12:00`, `18:00`.

## Supabase Runtime Tables

- `worker_job_states`: latest per-job state for UI and audits.
- `worker_job_runs`: append-only route-level execution history.
- `worker_logs`: lightweight boot markers and error excerpts.
- `runtime_artifacts`: audit reports, visible diffs, source-health snapshots, and worker-state artifacts.
- `source_sessions`: encrypted browser sessions/cookies for Threads, Instagram, and InvestAnchors where applicable.

## Session Security

`source_sessions.encrypted_payload` stores only encrypted JSON. The encryption key is derived from `SOURCE_SESSION_ENCRYPTION_KEY` when present, otherwise from a service-only runtime secret. If Supabase is unavailable, the local session file remains a migration fallback, but successful cloud writes become the preferred source.

Frontend/API code never exposes encrypted payloads. Source health uses only metadata such as `validated_at`, `expires_at`, `status`, and `failure_reason`.

## Freshness Semantics

For social connectors, the SLA is 6 hours:

- `fresh`: terminal run or successful write within SLA.
- `stale`: last success exists but exceeds SLA.
- `degraded`: terminal run failed with connector-specific failure.
- `missing`: no terminal run/state is available.

Every degraded or stale state must include a connector-specific reason. Generic "waiting worker" text is not sufficient after the SLA is missed.

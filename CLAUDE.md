# StockInsider — Claude Code Agent Guide

## Project Overview

台股投資研究平台。Next.js App Router 前端部署在 Vercel，Supabase 作為資料庫，GitHub Actions 執行夜間排程。

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Database**: Supabase (PostgreSQL) — 46 tables
- **Deployment**: Vercel (crons in `web/vercel.json`)
- **CI/CD**: GitHub Actions (`.github/workflows/`)

## Key Files

| File | Purpose |
|------|---------|
| `web/src/lib/domain.ts` | Core domain logic: seeds, pipeline, radar payload, fallback |
| `web/src/lib/research-v2.ts` | Research pipeline: thesis refresh, broker reports, KOL sources |
| `web/src/app/page.tsx` | Homepage — renders radar data |
| `web/src/app/stock/[symbol]/page.tsx` | Individual stock page |
| `web/vercel.json` | Vercel cron schedule (19 jobs) |
| `.github/workflows/night-shift.yml` | Nightly data pipeline via HTTP calls |
| `supabase_schema.sql` | Full Supabase schema definition |

## Commands

```bash
cd web && npm run dev     # Start dev server (localhost:3000)
cd web && npm run build   # Production build check
cd web && npm run lint    # Lint check
```

## Internal API Endpoints

All internal endpoints at `/api/internal/*` require:
- `Authorization: Bearer $INTERNAL_API_KEY` header (POST)
- Or Vercel `CRON_SECRET` (GET from cron)

Key endpoints:
- `pipeline-run` — main stock analysis pipeline
- `ingestion-run` — data ingestion batch
- `source-sync?connector={name}` — social source sync (investanchors/threads/instagram/telegram/ptt/bulltalk)
- `theme-scan` — theme heat analysis
- `story-scan` / `story-verify` — story discovery & verification
- `thesis-refresh` — thesis model updates
- `research-report-build` — final report generation
- `dynamic-mention-scan` — community stock mention feedback
- `broker-report-ingest` — public broker report summaries (Anue)
- `earnings-call-ingest` — 法說會資料收集
- `mops-filing-ingest` — MOPS 重大訊息公告
- `podcast-sync` / `podcast-transcribe` — YouTube/Podcast sync + Whisper transcription
- `source-discovery` — KOL ranking & source quality

## Data Architecture

```
TW_STORY_RESEARCH_SEEDS (40 stocks, 11 themes)
    ↓ runIngestionBatch()
stocks + stock_signals
    ↓ runThemeScan()
theme_heat
    ↓ runStoryScan() + runStoryVerify()
story_candidates + story_evidence_items
    ↓ runThesisRefresh()
thesis_models + thesis_evidence_matrix + valuation_scenarios
    ↓ runRecommendationBatch()
recommendations
    ↓ getRadarPayload()
Homepage display (merges Supabase + fallback for missing stocks)
```

## Night-Shift Agent Tasks

When running as an automated agent, focus on:

1. **Coverage Gap Analysis** — Find stocks in `TW_STORY_RESEARCH_SEEDS` that lack Supabase data
2. **Pipeline Health Check** — Verify all API routes export GET+POST correctly
3. **Data Quality Audit** — Check `recommendations`, `thesis_models` for stale or missing data
4. **Code Quality Sweep** — Review error handling in domain.ts / research-v2.ts
5. **Schema Drift Check** — Compare `supabase_schema.sql` with actual table usage in code

## Agent Skills System

Reusable skill definitions in `.agent/skills/`:

| Skill | File | Purpose |
|-------|------|---------|
| Data Gap Scanner | `data-gap-scanner.md` | 找出 Supabase 缺少資料的股票 |
| Source Quality Auditor | `source-quality-auditor.md` | 檢查社群 connector 抓取品質 |
| Thesis Validator | `thesis-validator.md` | 驗證論點是否仍然成立 |
| Pipeline Health Checker | `pipeline-health-checker.md` | 驗證 routes/crons/workflow 一致性 |
| Stock Discovery Agent | `stock-discovery-agent.md` | 從社群發現新的潛在股票 |

To run a skill: read the skill file, follow its instructions, output report to `.agent/reports/`.

## Data Sources (All Automated)

| Source | Connector | Schedule | Status |
|--------|-----------|----------|--------|
| InvestAnchors | source-sync | Daily 01:00 TW | Active |
| Threads | source-sync | Daily 01:05 TW | Active |
| Instagram | source-sync | Daily 01:10 TW | Active |
| Telegram | source-sync | Daily 01:15 TW | Active |
| PTT Stock | source-sync | Daily 01:20 TW | Active |
| BullTalk | source-sync | Daily 01:25 TW | Active |
| YouTube/Podcast | podcast-sync + transcribe | Daily 01:45-01:55 TW | Active |
| Anue 投顧報告 | broker-report-ingest | Mon/Thu 09:00 TW | Active |
| 法說會 | earnings-call-ingest | Weekdays 10:00 TW | Active |
| MOPS 重大訊息 | mops-filing-ingest | Weekdays 10:30 TW | Active |
| KOL 追蹤 | 11 KOLs in KOL_SEEDS | Via source-sync | Active |
| 社群提及反饋 | dynamic-mention-scan | Weekdays 08:15 TW | Active |
| 月營收/基本面 | revenue-ingestion | In pipeline-run | Active |

## Rules for Automated Agents

- Never modify `.env`, `.env.local`, or any secrets files
- All Supabase writes must go through `requireInternalAuth()` guarded endpoints
- Always run `cd web && npm run build` after code changes to verify compilation
- Create a branch and PR for non-trivial changes; never push directly to main
- Write reports to `.agent/reports/` with ISO timestamp prefix

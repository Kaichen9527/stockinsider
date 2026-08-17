# StockInsider Loop Adoption Summary

Generated: 2026-06-22; reconciled: 2026-08-17
Profile: `codex-only`

## Current System Inventory

- App: Next.js App Router app under `web/`, deployed to Vercel.
- Data truth: Supabase PostgreSQL plus local launchd workers for browser/social connectors.
- Existing project guide: `AGENTS.md` remains canonical for StockInsider-specific rules.
- Loop guide: `AGENTS.loop-engineering.md`, `docs/engineering/LOOP_ENGINEERING.md`, and `.loop-engineering/policy.yaml` are additive workflow rules.
- Existing project skills: `.agent/skills/` are preserved for StockInsider operational audits.
- Loop project skills: `.agents/skills/loop-*` are available for Loop workflow commands.
- Durable specs: Spec Kit constitution is installed at `.specify/memory/constitution.md`; the active V3 contract graph remains under `.loop-engineering/state/changes/source-led-opportunity-engine-v3/`.
- Codex checkers: `.codex/config.toml` and the five read-only Loop checker profiles were restored by the non-overwriting codex-only initializer.

## Behavior Classification

- INTENDED: Vercel deploys web/API only; browser/social connectors run from local worker and write Supabase.
- INTENDED: Production deploy must remain manual and gated; Loop release must not auto-deploy.
- INTENDED: Supabase migrations, retention, and production writes require explicit user approval.
- OBSERVED: The permanent canonical repository is `/Users/kaerchen/Desktop/20_stock/StockInsider/repo`; legacy temporary worktrees are inventoried separately and are not release authority.
- OBSERVED: `specify 0.12.11`, the project Loop skills, authoritative product/runtime commands, and model-runner tests are available.
- DECIDED: historical artifacts remain append-only evidence; `current-release.json` is the sole machine-readable current action queue and does not redefine the reviewed runtime source.

## Initial Risk Register

- Legacy worktree risk: preserve dirty/unpushed trees; only clean remote-reachable trees may be removed after release closure.
- Secrets risk: never edit `.env`, `.env.local`, or session/cookie files.
- Data cost risk: keep Supabase-heavy audits explicit and avoid automatic production sweeps.
- Workflow drift risk: future Loop tasks should map StockInsider gates to real commands in `.loop-engineering/commands.json`.

## Recommended First Loop Domains

1. `stock-recommendation-engine`
2. `valuation-and-revaluation`
3. `social-source-ingestion`
4. `supabase-io-runtime-health`
5. `deep-dive-entry-decision-ui`

## Next Commands

- `$loop-baseline stock-recommendation-engine`
- `$loop-change <issue-id>` for the next product change
- `$loop-verify <feature-id>` before any release decision

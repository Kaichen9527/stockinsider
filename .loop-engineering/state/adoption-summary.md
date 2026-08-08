# StockInsider Loop Adoption Summary

Generated: 2026-06-22
Profile: `codex-only`

## Current System Inventory

- App: Next.js App Router app under `web/`, deployed to Vercel.
- Data truth: Supabase PostgreSQL plus local launchd workers for browser/social connectors.
- Existing project guide: `AGENTS.md` remains canonical for StockInsider-specific rules.
- Loop guide: `AGENTS.loop-engineering.md`, `docs/engineering/LOOP_ENGINEERING.md`, and `.loop-engineering/policy.yaml` are additive workflow rules.
- Existing project skills: `.agent/skills/` are preserved for StockInsider operational audits.
- Loop project skills: `.agents/skills/loop-*` are available for Loop workflow commands.
- Durable specs: current repo uses OpenSpec under `openspec/`; Spec Kit `.specify/` was not installed during init.

## Behavior Classification

- INTENDED: Vercel deploys web/API only; browser/social connectors run from local worker and write Supabase.
- INTENDED: Production deploy must remain manual and gated; Loop release must not auto-deploy.
- INTENDED: Supabase migrations, retention, and production writes require explicit user approval.
- OBSERVED: Worktree already contains many unrelated modified/untracked files; Loop adoption must stay additive.
- OBSERVED: `npm run lint` and `npm run build` pass after Loop adoption.
- UNKNOWN: Spec Kit CLI availability; init reported `specify CLI missing`.
- UNKNOWN: Whether future Loop work should migrate OpenSpec artifacts into Spec Kit or keep OpenSpec as the durable spec layer.

## Initial Risk Register

- Dirty worktree risk: avoid broad formatting, cleanup, or revert commands.
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

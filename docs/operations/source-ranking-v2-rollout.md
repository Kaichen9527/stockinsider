# Source Ranking V2 rollout

## Immutable deployment identity

- Canonical origin: `https://stockinsider-three.vercel.app`
- Canonical Vercel project: `stockinsider` / `prj_cYNVwaGMMbgAeCnw6UqbIrLvlKYC`
- Legacy redirect project: `stockinsider-three` / `prj_1dlow0i7TwngAHfIT75OCU4VSp9e`
- Legacy alias: `stockinsider-three-one.vercel.app`

The project-name/alias mismatch is real. Do not infer a Vercel project from the
hostname; the production build guard verifies the system environment variables.

## Ordered release

1. Apply `migrations/20260830_source_ranking_v2.sql` before deploying application
   code. Verify all new tables, indexes and `source_document_coverage` exist.
2. Configure the canonical project and GitHub environment without copying any
   secret into the repository:
   - `APP_URL=https://stockinsider-three.vercel.app`
   - `INTERNAL_API_KEY` and `CRON_SECRET`
   - `THREADS_OFFICIAL_API_ENABLED=false` until Meta App Review passes
   - `TELEGRAM_PUBLIC_CHANNELS_AUTHORIZED=true` only after the channel-use basis is recorded
   - `PTT_METADATA_AUTHORIZED=true` only after metadata-use review
   - BullTalk variables only after a CMoney partner/API agreement
3. Deploy the canonical project and verify `/api/internal/health-check`, the 20:00
   monitoring cron, and one dry source run.
4. Enable GitHub `source-refresh.yml` and `night-shift.yml`. Require their JSON
   artifacts to show accepted terminal reasons and explicit write outcomes.
5. After one successful cloud source cycle, unload the installed
   `com.stockinsider.auth-source-worker` LaunchAgent. Threads stays `blocked_auth`
   until App Review passes and the long-lived token is written to Supabase Vault.
6. Deploy `deployment/legacy-vercel` to the legacy project. Verify HTTP 308 for
   paths and query strings, confirm it has zero cron jobs, and monitor for seven
   days. Delete the legacy project only after the observation window.
7. Start the 30-trading-day shadow window. Do not remove the experimental label
   until completeness/freshness reaches 95%, point-in-time replay is reproducible,
   and the frozen acceptance gates pass.

## Rollback

- Pause the two GitHub workflows before changing application code.
- Keep the migration in place; new tables are additive and audit history must not
  be deleted.
- Revert the application deployment to the prior canonical deployment.
- Do not re-enable retired ingestion or synthetic/Yahoo fallbacks. A missing value
  stays `unknown` and blocks `actionable`.

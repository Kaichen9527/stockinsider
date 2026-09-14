# Exact implementation review — private scheduled-writer isolation

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `e4d093c8f5147c6401756d8ede60bdbafff5b0a0` / `b6c99cd36564ad6ba4c28d2931e3f93e85880e74`
- Full final range: `6dbbcb4af167097faefcca2c74f078a800716d1e..e4d093c8f5147c6401756d8ede60bdbafff5b0a0`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Authenticated source, history, market-data, research and health schedules now call a dedicated private Next.js worker bound to `127.0.0.1:3101`; the public web process remains bound to `127.0.0.1:3100`.
- Every scheduled service requiring `APP_URL` depends on the private worker and is contract-tested to reject a public-port target.
- Schedule installation, Contabo cutover and writer-release activation start both processes and wait for their independent readiness probes before enabling writes or timers.
- The worker uses the same exact release manifest, Contabo data-plane identity, encrypted credentials and writer-release fence as the public process, while retaining outbound network access required for official-source acquisition.

## Production evidence reviewed

- Prior production source refreshes sharing the public Next.js event loop increased Radar and homepage latency to roughly 7–19 seconds; normal idle reads returned in roughly 0.13–0.37 seconds.
- The Contabo host accepted all candidate systemd units through `systemd-analyze verify` before this review.
- The current Contabo PostgreSQL, PostgREST and Nginx loopback data plane remains unchanged; this patch introduces no public listener, schema change or migration.
- Production activation remains a later rollout gate. The post-deploy canary must exercise a real scheduled workload while measuring the public endpoint.

## Security and correctness reasoning

- The worker binds only to loopback and is not added to the public Nginx route.
- Secrets remain in protected environment files or systemd encrypted credentials; no secret is embedded in a unit, command line, repository file or readiness response.
- Existing production write locks, authenticated internal routes, release identity checks and database writer fencing remain mandatory.
- The public and worker services share immutable application bytes but have separate processes and event loops, preventing a long source request from blocking public rendering.
- Rollback disables the new worker together with the standalone web and PostgREST services before restoring the legacy service.

## Verification

- Exact-commit product-correctness suite: 154 passed, 0 failed; captured output SHA-256 `16e17533703bcb1ad8bf89deb826bf1b24f8500bb098fb795d60a5e4a1956c9f`.
- Full product/runtime diagnostic completed successfully, including TypeScript, ESLint, production build and nine Playwright end-to-end tests.
- Focused infrastructure contracts: 29 passed, 0 failed.
- Shell syntax and `git diff --check` passed.
- Contabo `systemd-analyze verify` passed for the complete service, timer and socket set.

This review covers the exact implementation commit. Merge, exact-merge packaging, deployment, worker-load performance validation and old-release cleanup remain separate rollout gates.

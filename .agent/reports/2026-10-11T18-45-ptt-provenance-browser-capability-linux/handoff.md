# Exact7af pinned browser capability probe

No runtime/test/config/lock changes. Detached exact7af for launch/install, then returned to evidence branch60b. Default normal `chromium.launch()` from locked Playwright1.58.2 directly failed: missing `/home/agent/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell`. Raw full stack preserved.

One invocation `node web/node_modules/playwright/cli.js install chromium` attempted official pinned1208 / ChromeForTesting145.0.7632.6. CDN returned403 `Domain forbidden`. Supervisor terminated on first observed403 (SIGTERM exit-15). CLI had already printed its built-in second Downloading start; report this honestly, not as one HTTP attempt. No repeat CLI, mirror/version change, TLS/proxy bypass, apt, lock/dependency change.

Executable remains absent. Post-install launch and canonical were deliberately NOT STARTED because environment repair did not succeed. Original60b153PASS/2FAIL remains unchanged. Capability gap: existing cloud egress denies `cdn.playwright.dev` URL; runtime network policy state unknown, actual response explicit. No environment config/trust/firewall changes made.

Both filesystems remained above8GiB reserve; peak install process group172634112B, launch82956288B. No active owned Node/npm/PG/chrome afterward; no deletion needed. This is bounded manual engineering evidence, not canonical/protected/model/signature approval.

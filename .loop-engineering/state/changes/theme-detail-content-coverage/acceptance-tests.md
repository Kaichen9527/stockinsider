# Acceptance Tests: theme-detail-content-coverage

- `npm run audit:theme-detail-coverage -- --base-url http://127.0.0.1:3012`
- `npm run audit:theme-source-coverage -- --base-url http://127.0.0.1:3012`
- `npm run audit:theme-symbol-consistency -- --base-url http://127.0.0.1:3012`
- `cd web && npm run lint`
- `cd web && npm run build`
- `npm run audit:radar-live-availability -- --base-url http://127.0.0.1:3012`
- `npm run audit:global-theme-lead-lag -- --base-url http://127.0.0.1:3012`
- `npm run audit:source-health -- --base-url http://127.0.0.1:3012`

Smoke URLs:

- `/themes/quartz-frequency-components`
- `/themes/passive-components-mlcc`
- `/themes/memory-rerating`
- `/themes/ai-server-global-lead`
- `/themes/optical-cpo-global-lead`

# Threads OAuth lifecycle v7

- Added authenticated Meta `signed_request` verification for deauthorization and data-deletion callbacks.
- Added a service-role-only database function that deletes only the named `threads_access_token` Vault secret, invalidates the credential registry, and returns Threads to `blocked_auth`.
- Stored only hashes of the Threads user ID and deletion confirmation code; raw identifiers and tokens are not persisted by the callback flow.
- Added a capability-based deletion-status endpoint and retained the existing human-readable deletion policy page.
- Added both callback routes to the HTTPS-only Vercel allowlist so Meta never redirects them to the public HTTP VPS address.
- Bound the Vault token to the OAuth owner subject hash; another valid app user's callback cannot revoke the shared ingestion credential. Signed requests require a fresh `issued_at` and are idempotent by request digest.
- Reduced the homepage's initial stage-card transport to 24 cards while preserving revision-bound Load More, closing the remaining 200 KB HTML budget gap observed after PR #208.
- Added runtime and migration contract tests; TypeScript, ESLint, and production build pass locally.

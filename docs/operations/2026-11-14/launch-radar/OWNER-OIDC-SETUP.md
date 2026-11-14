# Owner login configuration handoff — not configured or deployed

Source `faaaf9816240def8a14eb7d5e215ff4ed09c62a0` adds a callable, production-disabled Google OIDC browser path. This document supplies configuration requirements only. No account, application origin, secret, subject, outbound grant or production setting was installed in this VM. Authentication grants no source-content rights.

After the existing independent formal/protected review, CI and release gates permit activation, the owner/admin can:

1. Register a dedicated Google OIDC **web application** using the approved HTTPS website origin. Register exactly `{approved HTTPS origin}/api/owner/callback` as its authorized redirect URI. Request only `openid`; this implementation does not request Gmail, Drive, profile, email, offline access or platform member-content permission.
2. Obtain the authorized account's exact immutable OIDC `sub` from a trusted owner-side verification process. Do not substitute email, an operator/author/reviewer identity, worker bearer or a subject supplied by the browser. The current product provides no self-enrollment endpoint. Establishing the initial trusted subject remains an owner prerequisite.
3. Inject these dedicated server settings through the deployment's approved secure runtime configuration mechanism. Do not put values in Git, PRs, chat, screenshots or example files. The secret is server-only and must not use a `NEXT_PUBLIC_` name. This agent neither reads nor edits `.env`/secret files.

| Setting name | Required shape |
| --- | --- |
| `STOCKINSIDER_OWNER_OIDC_ENABLED` | Absent/anything other than exact `true` keeps the feature disabled; enable only after all required gates |
| `STOCKINSIDER_OWNER_OIDC_APP_ORIGIN` | Canonical approved `https://` origin, no path/query/fragment/credentials; optional explicitly approved port |
| `STOCKINSIDER_OWNER_OIDC_CLIENT_ID` | Exact dedicated Google client ID, matching ID-token audience |
| `STOCKINSIDER_OWNER_OIDC_CLIENT_SECRET` | Dedicated web-client secret from approved secure custody |
| `STOCKINSIDER_OWNER_OIDC_OWNER_SUBJECTS` | JSON array of 1–20 distinct exact authorized OIDC subjects; never emails or caller-selected subjects |

4. Preserve HTTPS and the canonical Host through the trusted reverse proxy. The callback is constructed only from configured origin; arbitrary Host, Forwarded headers, `returnTo` or issuer requests cannot select it. Private HTML needs `Referrer-Policy: same-origin` for native POST forms to retain their exact Origin, while API/callback responses use `no-referrer`. Preserve private/no-store/surrogate-no-store and noindex on `/private-research`, and Cookie/Authorization Vary on private API responses. Never publicly cache or log callback query strings, cookies, tokens or secret configuration. The Next development callback request logger is suppressed; ingress/proxy log redaction remains a deployment prerequisite.
5. Review supported browser access to `https://accounts.google.com/o/oauth2/v2/auth`, and server HTTPS access to the exact fixed token endpoint `https://oauth2.googleapis.com/token` and JWKS endpoint `https://www.googleapis.com/oauth2/v3/certs`. This handoff changes no Cloud/host network policy; no alternative issuer, arbitrary ProxyCommand or test-provider environment override is supported.
6. In the isolated approved deployment, verify actual owner login, wrong-account rejection, short expiry, logout revocation, private cache headers and public exclusion using the real configured origin. Do not infer those results from controlled local tests. Missing/invalid configuration must return unconfigured 503 with zero provider calls.

Sessions and transactions are bounded **in-memory, per process**, with opaque Secure/HttpOnly/SameSite=Lax host-only cookies and <=300-second lifetime (session also capped by ID-token expiry). Restart invalidates all sessions; logout revokes the local application session, not the Google account globally. This slice has no reviewed shared session store, cross-process revocation, production rate limiter or multi-worker deployment claim. Before a multi-process deployment, supply and independently review those operating requirements rather than borrowing the test bootstrap or weakening verification.

The genuine authenticated response currently contains an empty `missing_data` research result with `owner_research_reader_not_connected` and `platform_content_rights_not_verified`. A separately authorized rights-qualified private reader is still needed. Do not copy public/service-role data or licensed source text into this response to make login appear complete. Public GETs never start research.

Native HOLD, VN01–VN20, A1/protected binding, writer/ledger/RLS, real-source/two-close-session acceptance, CI and deployment gates remain separate and incomplete. This handoff is not permission to enable a timer, apply SQL, install credentials or deploy from this executor.

# TaskBuddy consolidation dependency audit

## Outcome

No TaskBuddy route, process, release, image, configuration or data was changed.
The proposed v5.39/v5.36-only consolidation is **not yet safe**: the two retained
versions are frontend-only deployments whose Nginx sites do not bind `/api/`, and
their own version receipts state `humanContentApproval: false`. Static route-name
coverage does not prove application or data-plane equivalence.

## Live identity map

The production host has 31 enabled TaskBuddy Nginx files and 30 unique TaskBuddy
hostnames. Two enabled files claim `v4.5.104.83.211.nip.io`; Nginx reports the
second declaration as ignored. A loopback request confirmed the effective site is
the `/opt/taskbuddy/App/frontend/dist` production frontend, not feature100.

The four live API listeners are:

| Identity | Port | Process release | Public binding |
|---|---:|---|---|
| production | 3030 | `/opt/taskbuddy/releases/61e22f103a20` | v4 `/api/` |
| isolated demo | 3031 | `/opt/taskbuddy-demo/releases/258e57e9195c` | demo `/api/` |
| feature100 | 3032 | `/opt/taskbuddy-feature100/releases/100-20260719083652` | duplicate v4 declaration is ignored |
| isolated v5.23 demo | 30523 | `/opt/taskbuddy-v523/releases/a8643dba85d7` | v523 `/api/` |

The production export worker is a separate PM2 process rooted at
`/opt/taskbuddy/releases/36cef2ea5b4b`. All four API `/health` and
`/api/test-gate/status` canaries returned HTTP 200. Those checks establish process
availability only; they do not prove database identity or authenticated endpoint
equivalence.

## v5.39/v5.36 coverage findings

- Both frontends compile their API base as `/api`.
- Neither `v539.5.104.83.211.nip.io` nor `v536.5.104.83.211.nip.io` has an Nginx
  `/api/` proxy. Requests to `/health` currently return the SPA `index.html`, so
  HTTP 200 there is not an API health signal.
- Both expose the same 33 observed browser-route literals as v5.1–v5.35, except
  the earliest v5 site, which exposes only two. Their entry-bundle hashes differ,
  so matching route names do not establish matching behavior or request schemas.
- The effective production v4 frontend additionally exposes `/iceberg`,
  `/recovery` and `/vector`; these were not found in v5.39/v5.36.
- The v5.39 receipt says `contentReview: agent-audited-awaiting-user-v539` and
  `humanContentApproval: false`; v5.36 also says `humanContentApproval: false`.
- Production, demo and v5.23 backend source expose the same 108 static route
  method/path pairs and the same server-tree hash. Feature100 has the same route
  pairs but a different server-tree hash. This does not permit cross-routing:
  existing Nginx policy explicitly identifies demo and v5.23 as isolated data
  planes.

## Capacity opportunity and blockers

Twenty-five TaskBuddy version directories outside production, demo, feature100,
v5.23, v5.36 and v5.39 occupy 2,071,588,490 bytes. This is a potential recovery
amount, not deletion eligibility.

Before any of those paths can be retired, TaskBuddy must provide a reviewed
attestation that:

1. v5.39 and v5.36 are human-approved and their compiled API request contract is
   compatible with a named retained production backend;
2. `/api/` and real `/health` are explicitly bound and pass authenticated read and
   write canaries without redirecting write methods;
3. `/iceberg`, `/recovery` and `/vector` are migrated or explicitly retired;
4. demo and v5.23 isolation is preserved, or their data and reset semantics are
   independently migrated and verified;
5. the production API and export worker releases remain retained and restorable;
6. every exact old release/config is encrypted, independently restored and
   freshly reference-scanned before it is listed as a cleanup candidate.

The duplicate feature100 Nginx declaration is a real configuration defect, but it
was left unchanged. It has no capacity benefit, and changing it before archiving
the exact configuration and deciding whether feature100 needs a distinct hostname
would make rollback evidence weaker.

## Tooling correction

The deployment inventory parser previously missed inline Nginx dependencies such
as `location /api/ { proxy_pass ...; }`. PR #211 now scans Nginx directive
boundaries and records filesystem roots, loopback proxies and `server_name`
identities without reading credentials or process/container environments.


# Owner actions — isolated real-source/model acceptance remains incomplete

Observed on the original Codex VM, 2026-10-23. PR384 remains draft. These are prerequisites for the remaining real acceptance, not approval to merge, deploy, migrate production or restore paused schedules. Business/source/forecast implementation and ordinary hosted testing continue independently.

## 1. Preserve the existing VM before capacity or runtime changes

Environment ID (literal, not decoded):
`ccarenv_b64_Y2NhcmVudl84NzYxZDNhYjY0MDQ4MTkxYjYxNDFmMzAwN2FjNzQ3Yw`.
Original checkout: `/workspace/stockinsider-vnext-oct22`, branch `codex/stockinsider-vnext-oct22`. At 2026-10-23T08:23:57.491905Z, workspace/Gitcommon dev27 had 8,881,037,312 bytes available; `/tmp` dev34 had 17,247,440,896. These are dated observations, not future admission. The required reserve is 8,589,934,592 bytes **throughout** each workload. The next original-VM full build needs its measured approximately306MB compiler output plus128MiB headroom above that reserve; a fresh PG copy needs approximately912MB plus its additional bounded workset. Concurrent/platform growth remains unknown. Neither workload was admitted merely because free space exceeded the reserve.

No exposed management schema offers retained-data disk/volume/quota resize. The account is already Pro; upgrading to Pro is not a remedy. [Official specifications](https://learn.chatgpt.com/docs/environments/cloud-environments#vm-specifications) describe default32GiB and larger/custom specifications through the Enterprise account team; they do not promise in-place expansion of this existing task. Owner/platform support must confirm a supported in-place retained-data option and its actual size/cost before any action. Do not rebuild, move the checkout, switch mounts, prune or delete preserved data to simulate expansion.

Support request: “Preserve this exact running environment/task and its paths, Git objects/worktrees, retained PGdata, WIP, original failures and receipts. Is supported in-place disk/quota expansion available? State required downtime, consistency/snapshot procedure, rollback and retention guarantees. Separately account for `/tmp` tmpfs, running processes and memory-only identities; a disk snapshot must not be assumed to include them.” No downtime or restart is currently authorized by this document. Saved-state retention and polling/compaction are not a backup/resume guarantee.

Success: the same environment/checkout is observable with retained source and receipt hashes, adequate fresh reserve **plus** a bounded next workset, and unchanged original resource guard. If support cannot guarantee preservation, stop that operation and retain the existing VM. Hosted CI is separate execution evidence, not a claim that the original VM ran PG/build/browser.

## 2. Configure isolated runtime identities, then verify the same task

The actual environment-status response listed no capabilities, secret bindings, runtime variables or outbound identities. A names-only process check also found the following bindings absent. No secret values/files were read, no actual provider/source POST was attempted, and production credentials were not borrowed.

The documented management entry is **Settings → Codex Cloud → Environments → existing environment → Edit**, followed by the supported Save/Publish flow. See [official environment documentation](https://learn.chatgpt.com/docs/environments/cloud-environments). This documents environment/domain settings; it does **not** establish a rawTCP SSH rule editor or live secret update for an existing task. Republish is not assumed to change this running task. The owner/platform must use a supported injection mechanism, then re-read this same environment's readiness metadata and names-only effective process configuration. If settings only apply to new tasks, ask support for a preservation-safe current-task path; do not silently abandon or restart this VM.

| Binding | Nonsecret decision and constraint |
|---|---|
| `STOCKINSIDER_VNEXT_ENABLED` | `true` only in the new isolated application after all isolation checks; production stays untouched. |
| `INTERNAL_API_KEY`, `STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL` | New isolated operator credential and an enabled operator principal in the isolated DB; request bodies cannot select an arbitrary identity. |
| `STOCKINSIDER_VNEXT_AUTHOR_KEY`, `_AUTHOR_PRINCIPAL` and `STOCKINSIDER_VNEXT_REVIEWER_KEY`, `_REVIEWER_PRINCIPAL` | Distinct isolated credentials/principals, matching enabled DB roles. Different author/reviewer executions and original evidence access remain mandatory. |
| `OPENAI_API_KEY` | Existing legitimately authorized provider account, safely injected; no purchase or shared production key reuse. |
| `STOCKINSIDER_VNEXT_AUTHOR_MODEL`, `_AUTHOR_MODEL_VERSION`, `_REVIEWER_MODEL`, `_REVIEWER_MODEL_VERSION` | Actual allowed provider model/version identifiers, not synthetic fixture names or invented identifiers. Match the isolated immutable provider bindings. |
| `STOCKINSIDER_VNEXT_WORKER_PROMPT_VERSION` | Exact reviewed finite server profile. Defaultv2, v3catalyst, v4cancellation and v5business are distinct; v5 does not claim v4 cancellation coverage. Match exact instruction/prompt hashes and credential identity in the DB. |
| `STOCKINSIDER_VNEXT_MARKET_MODEL`, `_MARKET_MODEL_VERSION` | Actual authorized model/version for the frozen market journal; no resampling an already recorded snapshot. |
| `TWSE_OFFICIAL_OPENAPI_ENABLED`, `PTT_METADATA_AUTHORIZED` | Enable only the exact permitted acquisition/content scope after owner confirms its rights; the flags alone do not authorize text, exhaustive history or semantic approval. |

Secrets belong only in supported platform injection, never chat, argv, Git, artifacts or `.env` edits. HTTPS proxy network-secret placeholders are not SSH keys or direct DB credentials. App-side credential identity hashing and actual transport must agree with the effective binding; a placeholder alone is not proof. Real attempts still reserve from the common20active/4actual-attempts ledger before expensive work, include failures, and never re-POST an uncertain invocation automatically.

Choose **one isolated DB transport** under existing guards, not both or production fallback:

* Supabase: new isolated project; `OPPORTUNITY_V3_SUPABASE_PROJECT_REF` is its actual20-character reference, `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` must equal `https://<ref>.supabase.co/`; safely inject `SUPABASE_SERVICE_ROLE_KEY` (or existing supported `SUPABASE_SERVICE_KEY`) and matching `OPPORTUNITY_V3_SERVICE_ROLE_KEY_SHA256`. No test-bypass flag for staging.
* Contabo: `STOCKINSIDER_DATA_PLANE=contabo`, isolated `STOCKINSIDER_BACKEND_ID`, UUID `OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID`, and40-lowerhex `STOCKINSIDER_WRITER_RELEASE_ID` bound to the only active **isolated DB** `vps` writer row. The existing credential reader uses `STOCKINSIDER_POSTGREST_JWT_CREDENTIAL` (default `postgrest-service-role.jwt`) and `STOCKINSIDER_POSTGREST_JWT_SHA256`; do not write/read a real secret file in this task. `STOCKINSIDER_POSTGREST_URL` must retain its loopback3302 guard inside an independent app network namespace. Host formal3302 cannot stand in for isolation.

Success is metadata readiness plus authenticated isolated role/writer/lease/RLS checks and immutable provider/source bindings, followed by a separately admitted bounded real execution. Injection alone is neither formal research nor proof of semantic review.

## 3. Contabo trust and isolation — not a current staging endpoint

Known locator `5.104.83.211` / `vmi3152467` identifies the existing host, not an established application staging environment. No trusted host key or scoped rawTCP22 grant has been established here. The historical memory-only staging SSH key expired at2026-10-22T00:08:18Z; do not use the old console APPLY block or renew it implicitly.

Only after owner authenticates through their existing trusted Contabo console/VNC, this **read-only** block can return nonsecret trust/capacity facts. It installs nothing and changes no service/DB/account/key:

```sh
set -eu
test "$(hostname -s)" = vmi3152467
hostname -s
hostname -I
test -f /etc/ssh/ssh_host_ed25519_key.pub
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
cat /etc/ssh/ssh_host_ed25519_key.pub
df -B1 -- / /srv
awk '/^MemAvailable:/ {print $1, $2, $3}' /proc/meminfo
```

Customer Panel was observed to provide independent VNC access, not a verified browser-terminal UI; no button sequence is invented. Owner returns the public host-key line/fingerprint and these nonsecret facts through the trusted channel. Separately request the platform administrator/support to allow **only `5.104.83.211/32`, TCP destination22**, for this environment. No verified public tool/UI exposes that rawTCP edit. Publishing an HTTPS-domain draft is not an SSH grant. No accept-new, SSH-keyscan trust substitution, HTTP CONNECT, port443 substitution, tunnel or new VPN workaround.

Then review one new bounded identity/expiry and the isolated plan before creating resources. `deployment/staging/vnext/plan.json` names `stockinsider-vnext-oct22-staging`, independent service/database `stockinsider_vnext_oct22_staging`/schema/queue/storage/runtime identity, host loopback ports34222/34223/34224, fixture-only data and disabled schedules. Storage is `/srv/stockinsider-vnext-oct22-staging`. Web network namespace must resolve its private REST3302 to staging34223, never production. Original resource admission deducts peak/WAL/temp/deploy/growth allowances while retaining15GiB disk and1.5GiB available memory (warning below20GiB). No broad root/docker-group login or existing production credential reuse.

Existing bootstrap/verify dry-run and forced preflight prove only bounded login/capacity when executed, not app/DB isolation or deployment authority. No host mutation/paid resize is authorized by this report. Success requires trusted host identity, actual scoped transport, reviewed least-privilege identity and independently demonstrated isolated resources, then fixture-only staging receipt. Existing services/DB/schedules remain untouched; no planned downtime for them.

## 4. Source contracts and review are separate owner prerequisites

For real content, confirm per-source permitted original/summary/index/structured-claim scope and publication/event/availability dates. Paid InvestAnchors/member text and Telegram raw messages remain prohibited; rights-attested bounded operator-authored claims are a different scope. PTT metadata is not automatically full-text authority. No new paid subscription is required by this work.

An exhaustive28-day producer needs an actual authorized feed contract: original event dates/revision IDs, bounded pagination and trustworthy terminal/cursor behavior, issuer/publisher/author identities and outage semantics. Current TWSE snapshots, limited PTT pages and GDELT first-seen timestamps do not provide that proof. Missing contract/rights is external; source-specific connector/cursor/receipt/current-reader engineering remains a separate uncompleted code item. Do not label all remaining engineering “staging blocked,” infer zero volume from outages or invent independent roots.

Corporate-action target rebasing additionally needs authoritative share ratios, cash/rights terms and reviewed target-price versus total-return intent. Existing pre/post reference-price factors cannot supply omitted terms. The original reviewed baseline stays immutable; unsupported actions keep an explicit gap. Forecasts require actual source-bound period/share/unit inputs, not EPS history relabelled as forecasts.

After source freeze, an **independent authorized reviewer** must use the existing protected requirements/architecture/exact-source review process for the current exact subject. Current ordinary successes do not satisfy protected requirements/architecture/exact/root failures. Maker does not issue their own approval/ref or change pins. Earlier bounded inspection observed a missing exact-subject prerequisite; it did not prove every hosted bootstrap failure has one exclusive cause. No denied403 retry is planned.

## Dependency order and limits

1. Preserve existing data/state; obtain supported current-task capacity/injection behavior if needed.
2. Establish isolated DB/role/writer/provider and per-source rights bindings; or complete trusted Contabo transport/isolation first if that is the selected DB.
3. Admit a bounded real source→receipt→prepare→distinct author/reviewer invocation→claim evidence→current-rights/version/contra publication recheck→isolated HTTP/UI run. Report negative outcomes without recharging/reposting uncertainty.
4. Independently review the frozen exact source; run remaining ordinary/protected/time/staging acceptance. Two real consecutive postclose sessions are a time test, not an instruction for owner to simulate dates.
5. Request separate final approval before any merge, production deployment/migration or paused-scheduler restoration.

No item here replaces remaining VM implementation/matrix work. Real-source acquisition, real model execution, independent semantic approval, Contabo staging, protected exact review and final formal publication remain **unverified**. Existing synthetic/hosted receipts retain their own source and execution scope.

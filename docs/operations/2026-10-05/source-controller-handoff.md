# Source read / attempt controller handoff

Branch: `codex/source-attempt-controller-oct05`.
Base: `3b448b44674dd681b41c03f6c6fdd4af8d87167e`.
The worker's final reply supplies the exact pushed implementation SHA; this file
does not grant independent review, deployment, scheduling or strategy authority.

## File ownership and resulting behavior

- `scripts/research-source-controller.mjs` and `scripts/research-source-controller.test.mjs`:
  explicit JSON CLI, finite reviewed public grants, pinned verified TLS, cancellable
  A/AAAA resolution, one GET per scope, streaming/body/time/run limits, no headers
  supplied by the packet, create-only mode0600 output and no submission/model calls.
- `web/src/lib/research-source-attempt-controller.ts` and its `.test.ts`:
  strict source/rights/summary/temporal validation, actual per-scope read receipts,
  unchanged priority-attempt and inbox item formats, parent/root/revision/replay
  accounting and visible failures/metadata/awaiting-summary outcomes.
- `openspec/changes/research-source-attempt-controller-v1/spec.md` and `tasks.md`:
  this bounded batch's contract, executable case mapping and still-open gates.
- This handoff only. No existing source, root package/lockfile, migration,
  protected runner, research/trading rule, production state or other worker file
  was changed. Earlier Cloud acceptance/continuation artifacts remain retained.

The controller reads only supplied exact scopes; it never searches a whole
platform. No relevant-empty inference is implemented. Actual HTTP failure, login,
metadata index, missing transcript and body awaiting a summary all remain distinct
failed/partial research attempts. A skipped deadline scope is `not_attempted` and
`readAttempted=false`. Only a rights-reviewed, bounded, existing-validator item
can be emitted. Local Mac summaries never trigger a browser or HTTP dispatch.
They are operator attestations, not independently proved acquisitions.

Public bytes remain in bounded RAM and are discarded. Output retains SHA256,
size, HTTP/body availability and times, never raw HTML, headers or member bodies.
No model summary adapter exists: verified body availability without a separately
reviewed summary produces `source_awaiting_summary` and zero inbox items. A public
summary binds to the exact wire-byte hash; byte identity does not prove its claims.
The initial HTML recognizer is conservative (`article` text >=80 characters);
unrecognized page structure never establishes正文. RSS and watch/index metadata
are never accepted as a transcript. Full transcript acquisition remains absent.

Rumors survive as rumors. Reposts keep their parent chain and do not add roots.
First observation is retained per document, never backdated from its parent's
earlier discovery. Existing root/priority resolution preserves original withdrawal
over reposts. Retained prior items enable same-content replay suppression and
new immutable corrections; VPS heads remain the authority after submission.

## Explicit runtime and integration

Use Node 22.14.0 and the committed dependency lockfiles. There is no new root npm
script or scheduler. From the repository root:

```sh
node scripts/run-node22.js --experimental-strip-types scripts/research-source-controller.mjs \
  --input /absolute/operator-source-packet.json \
  --output /absolute/new-source-run.json
```

The packet has `runId`, `scopes`, and optional `priorItems`. Each scope has an ID,
reviewed platform/public URL, exact scope, `method`, `contentScope`, and
`rights: {basis,checkedAt,checkedBy}`. `local_authorized_summary` additionally has
`localRead: {attemptedAt,outcome,errorCode?}` and, when available, a bounded inbox
`summary` with explicit content/acquisition forms. Failed local reads can omit the
summary. Only necessary `authenticated_summary`/`authenticated_browser_summary`
research summaries are permitted; timed/member transcripts and secret fields reject.
`public_read` can include a human-reviewed public summary plus `summaryReadHash`;
its source URL/platform/hash must match the actual read. No arbitrary origin,
adapter, shell, header, credential or paid API can be supplied by JSON.

Bounds: 20 scopes, one page/GET each, 4 MB body each, 12 seconds total DNS/read
deadline each, 60 seconds sequential run admission, 2 MB packet/output and 1000
retained prior items. URL/scope text must fit the existing 500-character priority
scope field intact. Output is reserved using `wx` before reads, cannot overwrite
another file, and may remain empty on a failed command; choose a new output name.

Output `priorityRequest` contains this run's `asOf` and `sourceAttempts`; add the
existing independently reviewed `assessments` rather than inventing scores.
Output `inboxRequest.items` uses the existing inbox validator/hash. A trusted
controller submits nonempty items to the existing authenticated `research-inbox`
endpoint first, then uses the same run's attempts/asOf in `research-priority-run`.
Skip inbox POST when there are zero items; the endpoint requires 1–100. Existing
priority-run accounts for absent platforms as `not_attempted`. This batch does
not perform either POST or claim an actual server run/job/reservation.

The reader deliberately requires a validated direct DNS/TLS route; it does not
bypass address checks or transparently trust an arbitrary proxy. Platform-proxy
transport integration is still required if direct DNS/TLS is unavailable.

## Executed checks and diagnosed blockers

Node 22.14.0; Next 16.3.8; Linux Cloud; cgroup `memory.max=34359738368` and
`cpu.max=400000 100000`. These current-instance values are not a Project guarantee.

Executed 31 test cases, 31 passed, 0 failed, 0 skipped: 15 pure-controller cases,
9 CLI/transport cases and 7 existing inbox/priority/root cases. Cases exercise
404/provider failure/login/metadata/missing transcript, one rumor, withdrawal,
parent/repost chains, replay/correction, no backdated repost observation, future
data/rights, unknown/secret/full-text fields, URL/SSRF injection, private/mixed DNS,
wire-byte hash including BOM, TLS, no overwrite, symlink rejection and deadlines.

```sh
node scripts/run-node22.js --experimental-strip-types --test \
  web/src/lib/research-source-attempt-controller.test.ts \
  scripts/research-source-controller.test.mjs \
  web/src/lib/research-inbox.test.ts \
  web/src/lib/research-agent-priority.test.ts \
  web/src/lib/research-source-roots.test.ts
cd web
npm run typecheck
npm run lint
DATA_MODE=demo RADAR_PUBLIC_SNAPSHOTS_ENABLED=disabled NEXT_TELEMETRY_DISABLED=1 npm run build
```

The sandbox Node worker initially reported only file-level passes. Direct test
execution and the permitted non-sandbox test worker confirmed actual named cases;
31 is the real final case count, not that initial file count. Lint passes with
33 unchanged baseline warnings and zero errors.

Typecheck passed before webpack generated route checks. Current full tsc/build
acceptance is **not passed**: Turbopack fails internal port binding (`EPERM`), even
with the permitted command escalation. Supported `npm run build -- --webpack`
compiles, then fails generated App Router export validation for
`web/src/app/layout.tsx` (`CANONICAL_APP_URL`) and
`web/src/app/opportunity-v3/page.tsx` (`OpportunityV3Page`). A pristine archive of
exact base `3b448b...`, using the same lockfile-installed dependencies, reproduces
both errors. Current full typecheck reports those same two baseline errors and
no errors in owned controller files. Fixing unrelated routes is outside this batch;
the baseline errors must remain visible for integration.

## Real public canary receipts — acquisition blocked

Recorded Cloud run at **2026-10-05 08:27:38–08:27:43 Asia/Taipei**. Four source reads
were attempted. None obtained HTTP/body content; none were changed to
`no_relevant`, and no inbox item or activation was fabricated. Direct DNS failed;
separate diagnosis observed `EAI_AGAIN` and a TWSE HTTPS proxy CONNECT 403.
Readonly platform configuration has restricted egress, no custom domains, and
none of the three source hosts in its preset rules. Configuration was not changed.
Required destinations for review are `openapi.twse.com.tw`, `www.auo.com`, and
`feeds.soundon.fm`, plus a supported verified DNS/TLS/egress route. Allowlisting
alone does not prove a pinned transport or successful acquisition.

The full local artifact is
`/workspace/source-controller-oct05/public-canary-final-result.json` (10075 bytes),
SHA256 `de8ab765fe736a0015ae4da675eea2b2c2a35b63463e5c1bd9b33c83e6b9f3b6`.
It contains per-scope rights/time/content/attempt fields and receipts, no source
body or credentials. Run UUID `1be391ac-3588-44a3-ba89-03e727569f1f`,
runHash `5f1751535f8a0116c908465d720abfd107380d6c3b2ebaac5cc4c30c11859794`.
Executing source-file SHA256 values at that run:

- CLI: `d00d736ed2a0924865b9dac0821b06ce792e98099b9728bb5dfa2123c5f29410`.
- Pure consumer: `1909b7a979456ec03ef6b3e4f705f1ee1639f8d7da4911bd760cbfe1cf47093a`.

This immutable failure receipt predates the final JSON type/local-terminal guards
and monotonic run-deadline hardening. The source hashes above identify its actual
executing bytes; it is not a canary of the final pushed tree. Source chat must use
the final exact pushed SHA for its separately recorded Mac canaries. No additional
Cloud acquisition is claimed after the user's instruction to retain these failures.

| Exact public scope/URL | Attempted UTC | Completed UTC | Terminal | HTTP / bytes / body |
|---|---|---|---|---|
| One official issuer dataset: `https://openapi.twse.com.tw/v1/opendata/t187ap03_L` | 00:27:38.727 | 00:27:38.729 | `source_network_failed` | null / 0 / false |
| One official daily market dataset: `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL` | 00:27:38.729 | 00:27:38.731 | `source_network_failed` | null / 0 / false |
| Official news index only, no links followed: `https://www.auo.com/zh-TW/News_Archive/index` | 00:27:38.731 | 00:27:38.731 | `source_network_failed` | null / 0 / false |
| Existing creator RSS index only, no audio/transcript: `https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml` | 00:27:38.731 | 00:27:43.737 | `source_network_failed` | null / 0 / false |

Per-scope receipt hashes, in that order:

```json
[
  "bc479f2d55f4b6c88967c4900ebe929345d7d0b000d5dea217452f78c112a644",
  "c66ec8413f36ca5db8a52daeb95a0afe7189944ec0dbea015c8fad06c20bbed5",
  "9a67e4c6b610c2121c9b560715485f42da04d37a11661ea3f63ef9bcc29aa250",
  "14952061fa67b99e11eeb5c436f77f52bf1d88f5d8e8ba8ef4657b7c0abd8d1e"
]
```

## Open acceptance and integration responsibilities

Successful actual public document/article body reads remain blocked by Cloud
networking. There is no exhaustive search, all-platform activation, actual Mac
summary dispatch, model-summary adapter, approved issuer-domain registry expansion,
publisher transcript adapter, real VPS submission or scheduler here. News/social
paths are bounded manual summary intake only; they do not revive retired collectors.
Do not infer real source acquisition from synthetic transport/summary tests.

Source chat explicitly owns the Mac bounded-read canaries using the same pushed
exact code, recorded separately from the Cloud failures above; this worker will
not bypass Cloud networking or substitute a curl read for pinned-reader success.
It also owns independent review, migrations/history integration, baseline
route build fixes, supported network access/transport and PR/integration. This
worker pushes only its isolated branch and opens no PR. Existing Cloud synthetic
acceptance/continuation evidence stays unchanged; it still proves only its stated
scope, never production reservation/publication or VM/task persistence guarantees.

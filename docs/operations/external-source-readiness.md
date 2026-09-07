# External source readiness: Threads, BullTalk, Podcast

This runbook is a setup contract, not production authorization. Do not paste a
token into chat, Git, an environment file, command history, or an HTTP request to
the public VPS. Do not enable schedules or deploy from this document.

## Threads official API

StockInsider uses a dedicated Meta App and only the permissions
`threads_basic` and `threads_keyword_search`. The acquisition endpoint is pinned
to `https://graph.threads.com/v1.0/keyword_search`, with `search_type=RECENT`, a
seven-day window, bounded pagination, and no cookie, password, Instagram, or
HTML fallback. See the [official Keyword Search documentation](https://developers.facebook.com/docs/threads/keyword-search)
and [access-token documentation](https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions).

The connector remains `blocked_auth` unless all three runtime flags are true:

- `THREADS_DEDICATED_APP_CONFIRMED=true`
- `THREADS_OFFICIAL_API_ENABLED=true`
- `THREADS_OFFICIAL_CANARY_ACTIVE=true`

The last flag is evidence, not a shortcut. Set it only after the canary below
returns a receipt for a non-self public post.

### User interaction checkpoints

1. In Meta Developer, create or select the dedicated **StockInsider** App. The
   user must complete any Tester invitation, OAuth/2FA, identity, business, and
   App Review screens. An automated agent must not create the account or approve
   these declarations.
2. Configure the exact HTTPS callback
   `/api/auth/threads/callback` and request only `threads_basic` and
   `threads_keyword_search`. Provide Meta with the privacy/deletion URLs, use-case
   text, and recording required by App Review.
3. Store the App ID, App secret, state secret, redirect URI, and one neutral
   `THREADS_PUBLIC_CANARY_QUERY` in the deployment secret manager. Do not commit
   them. Keep `THREADS_OFFICIAL_CANARY_ACTIVE=false`.
4. Through an SSH tunnel or the private operator surface, POST to
   `/api/internal/threads-oauth-start` with the exact `INTERNAL_API_KEY` Bearer
   token, retain its HttpOnly state cookie, open the returned Meta authorization
   URL, and finish the consent prompt. The callback exchanges the code and writes
   the long-lived token directly to Supabase Vault; its response never returns a
   token.
5. POST `/api/internal/threads-canary` through the same private path. Review the
   hash-only receipt and confirm `status=non_self_public_post_verified`. A 200
   from Meta without that result is not a pass.
6. Only after review of that receipt, set
   `THREADS_OFFICIAL_CANARY_ACTIVE=true`. Run one dry source sync and one bounded
   real sync before any scheduler change. Refresh happens after 30 days; expiry
   at or below 14 days is an alert condition.

If App Review, Vault read, token exchange, `/me`, or the non-self public-post
search fails, leave the source `blocked_auth`. Never restore cookies or the
Instagram bridge.

## BullTalk / CMoney licensed feed

The only accepted inputs are a contract-authorized HTTPS JSON or CSV feed. The
adapter rejects HTML even when an HTML page responds with HTTP 200. CMoney's
[contact page](https://www.cmoney.com.tw/contact-us) is a contact channel, not an
API grant or sample feed.

### User interaction checkpoints

1. The operator supplies their own contact details and explicitly approves any
   outbound request. The request must cover ranking, stock code, discussion and
   engagement counts, dates, original links, retention, derived statistics, and
   public display rights. Agents do not submit forms or accept pricing/contracts.
2. After signature, record a non-secret contract/scope reference and obtain a
   real JSON/CSV sample. Independently review its columns and compute the exact
   sample SHA-256.
3. Only then configure `BULLTALK_LICENSED=true`,
   `BULLTALK_LICENSE_SCOPE_REF`, `BULLTALK_REAL_SAMPLE_SHA256`, and
   `BULLTALK_AUTHORIZED_FEED_URL`; store an optional feed token only in the secret
   manager.
4. A canary must show the expected schema and real rows. Until every item is
   present, registry and ledger stay `blocked_license` / `license_blocked`.

There is deliberately no CMoney HTML parser and no fallback to the public
BullTalk website.

## Podcast RSS, transcripts, and chapters

RSS indexing is active for creator-published allowlisted feeds and is independent
of content-analysis rights. The adapter recognizes the Podcast Namespace URI
even when the publisher uses a prefix other than `podcast`, and supports
publisher-linked `transcript` and `chapters` artifacts. See the
[Podcast Namespace specification](https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md).

`index_updated`, `content_analyzable`, and `valid_matches` are separate ledger
fields:

- `index_updated=true` means episode metadata was refreshed.
- `content_analyzable=true` requires a successfully parsed publisher-provided
  transcript/chapters artifact, or a recorded creator-rights allowlist entry.
- `valid_matches>0` requires explicit valid stock identifiers in analyzable
  content. Episode count is not a content-analysis receipt.

Transcript/chapters timecodes are retained with their publisher URLs and MIME
types. RSS audio enclosures remain references; this connector does not download,
copy, or transcribe audio. Failed or unsupported artifacts remain visible as
metadata with a typed failure and cannot create claims.

Artifact URLs are restricted to the RSS origin unless a reviewed publisher CDN
origin is added to `PODCAST_ARTIFACT_ORIGIN_ALLOWLIST`. Cross-origin redirects,
private hosts, credentials in URLs, entities, and DTDs are rejected.

For the 股癌 pilot, the user must establish the right to analyze, extract stock
mentions, display short summaries, and retain results. Acceptance requires at
least one timecoded valid-stock match and its source-run receipt. Public RSS by
itself does not grant permission to reproduce a transcript.

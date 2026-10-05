# Bounded source attempt controller — delegated October 5 batch

This batch implements only the source-read/attempt consumer authorized for
`codex/source-attempt-controller-oct05`, based on exact commit
`3b448b44674dd681b41c03f6c6fdd4af8d87167e`. It does not amend research scores,
financial rules, model roles/budgets, protected runners or production authority.
Existing source-registry, research-inbox, priority and root contracts remain
canonical. A configured capability or readable index is never platform activation.

## Input and trust

A trusted operator supplies a run UUID and 1–20 exact source scopes, each with a
rights-review basis, reviewer, review time, URL, content scope and acquisition
method. An optional bounded set of controller-retained prior inbox items supports
revision/replay accounting; it is not a replacement for authoritative VPS heads.
Input is JSON only, <=2 MB, with strict keys, depth/node limits, public HTTPS URL
roundtrips, concrete reviewed hosts, credential/query-injection rejection and
bounded existing inbox fields. Secret-field/text checks are defense in depth,
not a complete DLP detector or cryptographic proof of rights.

`public_read` is limited to reviewed AUO public news paths, TWSE public open-data
endpoints and the existing creator-published RSS index. Rights and content scope
must match the fixed grant. No input can add domains, headers, credentials,
commands, arbitrary adapters, retries, pagination or a paid API. Old retired and
auth/license-gated connectors retain their dispositions; no flag is enabled.

`local_authorized_summary` consumes only a necessary operator-reviewed summary
and actual Mac read terminal/time (within 35 hours). It never dispatches a browser
or transports cookies, auth.json, credentials, member full text or authenticated
transcript excerpts. The user/operator remains responsible for rights and source
accuracy. Neither a packet nor a result hash proves those facts independently.

## Bounds and read behavior

Public reads perform one GET per scope, <=4,000,000 response bytes, <=12 seconds
including cancellable DNS and total response time, and <=60 seconds of sequential
run admission. Resolve A/AAAA addresses, reuse the existing public-address guard,
pin the TLS socket to a validated address, preserve TLS verification, reject
redirects and require UTF-8. Remaining scopes after the deadline are explicitly
`not_attempted`, not a fictional read. HTTP/provider errors never become
`no_relevant`. Provider exceptions, headers and raw bodies are never exported.

HTML is parsed only as bounded inert text; scripts/styles/templates are discarded,
no links are followed, and embedded text is never executed or used as instructions.
The initial HTML body recognizer requires an article element with substantive
text. Unrecognized markup is conservatively non-content; it cannot establish an
article. Nonempty official JSON arrays/CSV can establish document availability,
not financial accuracy. RSS/program/video index and chapter metadata do not
establish an article or transcript. Missing transcript and login remain visible.

No model/summary adapter exists in this batch. Actual body availability without
a separately reviewed summary returns `awaiting_summary`, zero inbox items and
a failed/partial research source attempt. A supplied public summary must bind to
the exact response-byte SHA256 and the same URL/platform. The binding proves
byte identity, not semantic correctness. Local summaries use their attested local
read provenance, not a invented public HTTP success.

## Existing consumers and lineage

Output contains one run UUID, completion `asOf`, detailed per-scope receipts and
hashes, `priorityRequest.sourceAttempts` matching the existing priority-run API,
and `inboxRequest.items` validated by the existing inbox validator. Receipts retain
actual attempted/completed time, exact scope/URL, content scope, publication,
first observation, revision, parent/root URL, content/response hashes, withdrawal,
body availability and errors (unknown fields remain null). No exhaustive coverage
is claimed. Absent platforms are listed; existing priority-run fills their
`not_attempted` records. The controller does not invent candidate assessments.

Single rumors remain items. Reposts retain/flatten their parent chain and share
one root; original withdrawal continues to outrank reposts through the existing
priority/root resolver. Same-content replay produces zero new items; changed
content creates a new revision while retaining the document's valid original
observation time. Parent cycles and future publication/availability reject.

The trusted controller submits nonempty inbox items through the existing guarded
endpoint, then uses the same run's `asOf`/attempts plus existing reviewed assessments
for priority-run. This CLI has no submission or publication facility, no secrets,
no second durable store and no schedule/model/strategy activation authority.

## Acceptance mapping

| IDs | Executable acceptance |
|---|---|
| SC01–SC02 | Single rumor, unchanged inbox/priority contracts, failures/login/metadata/missing transcript distinct from empty relevance |
| SC03–SC05 | Actual body awaiting summary, index not transcript, inert HTML/login, bounded body |
| SC06–SC08 | SSRF/query/credential injection, secret/full-text fields, future/stale availability and rights |
| SC09–SC10 | Replay, corrected first observation, parent chain, original retraction suppressing independent repost root |
| SC11–SC15 | Exact public-byte binding, forged observations, bounds/cycles, truthful not-attempted deadline, no repost document backdating and strict primitive/local-terminal types |
| SCT01–SCT04 | Pinned public socket, mixed/private DNS, actual HTTP terminals/redirects, total DNS/read/body bounds and UTF-8 |
| SCT05–SCT09 | Consumer output, summary-only local boundary, create-only mode0600/no overwrite/symlink rejection, run deadline and exact wire-byte/TLS binding |

SC tests live in `web/src/lib/research-source-attempt-controller.test.ts`; SCT tests
live in `scripts/research-source-controller.test.mjs`. Also run existing inbox,
priority and root tests, typecheck, lint and production build. Real public canaries
must retain exact URLs/time/range/body availability and honest failures. Successful
body acquisition remains an open gate when platform network access blocks it.

Independent source-chat review and integration remain required; no PR, merge,
deployment, migration, strategy approval or source activation belongs to this batch.

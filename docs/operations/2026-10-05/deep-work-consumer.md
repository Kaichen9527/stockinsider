# Deep-work claim and interruption recovery

This implements the first trusted consumer boundary in the approved research
Agent plan. It does not finish company research, dispatch a Cloud model, publish
an article, activate a schedule or approve a strategy.

## One claim, durable identity

`scripts/research-deep-controller.mjs` calls the existing authenticated
`research-deep-job` route once with `action: claim` and an owner. The server
returns the selected job and its actual `company_research` reservation. The
context binds job ID, attempt, symbol, priority run, owner, reservation ID,
`deep:<jobId>:<attempt>`, original start/deadline and any accounting completion.
The controller does not accept caller-selected symbols or fabricate an ID.

The writer credential stays in the trusted process. It must differ from review,
test, strategy-approval and cron credentials. Origins are HTTPS or an explicit
127.0.0.1 HTTP tunnel, with no credentials, query or path. Redirects are rejected.
The exact source commit must be clean. Before requesting, the consumer writes
and fsyncs an exclusively created 0600 journal; its output is also exclusive
0600. It reuses the independently tested bounded transport, with a 15-second
deadline over headers **and the whole body**, and a four-megabyte body bound.

## Recovery is observation

If the claim response is lost or the server's post-claim context lookup fails,
the original request remains in the journal. A complete rejection response does
not prove the claim RPC was rolled back. The controller never retries a claim.

The explicit `recover` command reads the original bounded private journal,
checks source/owner/origin/request hash, and calls only `action: status`. A known
job/attempt from a hash-checked saved receipt further fences that lookup. Status
does not claim a new job, reserve a new model slot, extend a deadline or complete
the job. All output paths must differ from the original journal. Recovery of a
different source commit needs a separately reviewed migration path; this
consumer does not silently reinterpret an old packet.

An empty claim reports `no_claimable_job`: the existing RPC cannot distinguish
an empty queue from lease/budget exhaustion. An empty status reports
`no_active_owned_job`. Neither means successful research. After an expired
lease, recovery cannot revive the job. Accounting completion is visible but does
not mean a draft was saved or an article published.

Example invocations, with the writer key supplied by the existing trusted
runtime rather than command-line text:

```sh
node scripts/run-node22.js scripts/research-deep-controller.mjs claim \
  --origin https://REVIEWED_INTERNAL_ORIGIN --owner company-author-01 \
  --output /ABSOLUTE_PRIVATE_DIR/claim.json \
  --journal /ABSOLUTE_PRIVATE_DIR/claim.jsonl

node scripts/run-node22.js scripts/research-deep-controller.mjs recover \
  --origin https://REVIEWED_INTERNAL_ORIGIN --owner company-author-01 \
  --request-journal /ABSOLUTE_PRIVATE_DIR/claim.jsonl \
  --output /ABSOLUTE_PRIVATE_DIR/recovered.json \
  --journal /ABSOLUTE_PRIVATE_DIR/recovery.jsonl
```

## What still blocks dispatch

Every receipt explicitly says `modelDispatchable: false`, `modelCalls: 0`,
`draftPersisted: false` and `authoritativePublication: false`. The existing
dossier bundle does not supply a guaranteed rights-aware, bounded raw-document
projection at the job cutoff. A real author task still needs that input, durable
draft storage, typed author handoff, an independently budgeted review and the
existing fenced dossier submission. The original deep-job deadline covers
author, review and publication; generic Cloud completion cannot replace those
business receipts. No Cloud validation kind or publication rule is broadened by
this change.

Local tests include an actual HTTP server that commits one claim and drops the
reply; status then returns the identical reservation, with exactly one claim.
This is an executable interruption contract, not a successful live VPS/Cloud
research run. Protected review, capacity, production cutover and five actual
postdeployment trading days remain separate requirements.

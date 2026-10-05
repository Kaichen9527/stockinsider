# Bounded source controller integration — October 5

Integrated Cloud source commit `832b0428771c5a80047eb9518e55a41be8465cab`
with financial/release work `61a2fad322f6878daaea11a1a8c805a329abfce5` using
merge commit `6bf2a27524433b318f8f4925d5133fad9e5106bd`. These are prepared
branches, not merged main or deployed production.

Actual Mac reads exposed a Node 22 transport defect that mock transport tests
had missed: network family selection requests `lookup(...,{all:true})`, but the
callback returned a string. The reader now returns the validated pinned address
array for that contract and a single validated address for the ordinary contract.
It retains verified TLS, public-address checks and no second DNS lookup.

The reviewed AUO release uses a title and `html-edit` body rather than an
`article` element. Recognition now requires that exact official detail route
and both markers. Index pages and template drift remain metadata. Public RSS
episode wording mentioning login no longer falsely establishes an HTML login
wall; an RSS index still does not establish a transcript.

The immutable local canary summary is `source-controller-mac-canaries.json`.
Earlier failed attempts remain recorded, separately from the Cloud DNS/egress
failures. Final Mac results: four actual HTTP 200 responses, official TWSE
dataset and AUO release body available, AUO index and Podcast RSS metadata only.
Zero inbox items were emitted because no independently reviewed summary was
supplied. No platform was enabled, no VPS submission/publication was made, no
audio/transcript was obtained, and no exhaustive platform search is claimed.
Only response hashes, byte counts and bounded receipt metadata are retained.

Root commands `research:sources` and `test:research-sources` are now available.
The source tests participate in `test:research-agents`: 124 actual named tests
passed, zero failed/skipped. Mac lint passed with the existing 33 warnings and
zero errors; normal production build passed. This does not remove the separately
recorded Cloud build/network limitations or supply protected review evidence.

Open: source controller independent review, actual content-summary/search
consumer, authenticated social reads, issuer-domain expansion, public transcripts,
real priority/inbox acceptance, and full company research publication. AUO
continues to be a demonstration direction until its full acceptance completes.

Schema-only rehearsal also found pre-existing ownership drift in production
release routines: the V3.19 reader and source helpers are owned by `postgres`,
but replay creates/replaces them after switching to narrower owner roles. The
atomic chain failed and rolled back in an isolated database. A precise reviewed
ownership preflight/bridge is required; no production owner, data, credential,
role or check was modified. This is distinct from the independently approved
financial-history tail and cannot be hidden by assigning all fixture objects to
a local superuser.

Independent review of `54edb2c` identified three additional boundary defects.
Known source publication time is now checked against the supplied summary;
conflicts reject and retain both clocks. Parent traversal selects the latest
accepted revision, rejects contradictory equal-time heads and excludes failed
scope summaries. AUO index article scope is rejected even if a teaser uses an
`article` element. Regression cases SC16/18/19 exercise these reproductions.
The previous canaries identify their original executing source hashes; they
are not relabeled as acquisition evidence for a later changed tree.

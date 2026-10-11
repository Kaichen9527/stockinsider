# Bounded author input packet continuation

Scope: continue the approved v2 author chain inside the existing authenticated
model-reservation marker2. Add readAuthorPacket, not a new public endpoint,
reservation, completion, model dispatch, article write or eligibility path.
Existing assignAuthor/readAuthorAssignment and all v1 behavior stay unchanged.

One private read-only SQL RPC first calls the existing original assignment reader
and original revision context, retaining source -> global-deep locks. It requires
an existing exact assignment/principal, running original job/attempt/reservation,
current selected source seal/rights and exclusive original deadlines. It resolves
only the sealed manifest's exact row hashes and returns whitelisted public source
summaries; never full rows, content_text, private metadata, cookies or member text.
No source mutation, new table, ACL expansion, clock renewal or budget charge.

Source eligibility in this slice requires public_citation plus visibility=public,
company_mentions matching symbol or industry_context with no symbols, bounded
summary/title/catalyst/risk and finite original first-observed/admission times.
Legacy published_at never proves instant precision: this slice projects unknown
publication precision with null instant even when that field is populated, and
retains the timestamp only as an explicitly unverified publication claim. A
date-only value previously stored as midnight must remain unknown. A future
source contract must establish verified original precision before promotion.
Admission uses the actual existing source seal received_at, labelled seal-receipt
time rather than first DB admission; first_observed_at <= collected_at <= seal
received_at <= sealed complete-input research cutoff. Neither observation clock
is renamed admission. Empty manifests require no seal and no invented clock. Missing metadata,
unsupported rights/scope/clocks/URL or oversized material fails explicitly; never
silently drops a selected source or invents publication midnight. Current source
recheck and exact assignment expiry are repeated before SQL returns.

The server verifies the current compiled complete revision before the RPC, checks
that the transaction returned the identical revision and original assignment,
recalculates the fixed business model and verifies the sealed result, validates
all source descriptors and content bounds, and emits a <=1MiB model-safe packet. The same original10-second
FinancialDeadline covers streaming body, all RPCs, recomputation, validation,
serialization and the final return check. SQL bounds30sources, title512bytes,
summary4096bytes, catalyst/risk2048bytes each, aggregate projected source
content300KiB and total private response1MiB; the server enforces the same field
and source bounds and final packet1MiB. No truncation or partial success.
Server also rejects an original assignment deadline crossed during calculation
or serialization; SQL performs its final original-fence read before returning.
Only research identity, input/assignment IDs/hashes, original writing window,
source descriptors/public excerpts, financial facts/assumptions/calculation/gaps
and all-false capabilities are projected. Canonical request, principal, worker
owner, reservation/job IDs and credentials do not enter that packet. The private
controller keeps its own lineage outside model context. Untrusted source text is
labelled evidence, never executable instructions. Hash covers the exact packet.

Result/publication must later recheck live DB fences. Packet availability cannot
establish actual role execution, semantic citation support, research completeness,
publication or investment qualification. It does not remove sealed gaps, including
financial rights unverified and trusted execution unavailable.

Acceptance: actual original-PG RPC with synthetic sources/jobs plus real fixed
AUO calculation; exact read/replay/restart without state/charge changes; missing
assignment, different principal/input, source revision/withdrawal/private rights,
wrong company, bad clocks/metadata/oversize (exact/+1), legacy fabricated midnight,
RPC stall and expiry during calculation/serialization, expired original job and reservation,
service/anon ACL and model-safe omission. Server unit/route tests use actual auth
and parser with explicitly synthetic DB transport. Related regressions, type,
lint and normal build; independent scoped review before claiming completion.
No protected release, main merge or deployment in this increment.

Design review0d361af9 found twoP2 before runtime: legacy timestamp precision and
DB admission-clock meaning/deadline bounds. This amendment retains the original
findings and addresses them without changing source publication authority.

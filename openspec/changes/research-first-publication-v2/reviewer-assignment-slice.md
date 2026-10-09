# Independent reviewer reservation and work packet — bounded continuation

Continue492729b3's exact immutable author result/handoff, through the existing
model-reservation marker2 endpoint. Explicit x-research-review-assignment-action
selects assignReviewer/readReviewerAssignment/readReviewerPacket. Require the
separate exact reviewer Bearer and existing resolveResearchControllerIdentity;
reject author/cron/test aliases, mixed result/handoff headers, unknown versions
and any author/request-supplied principal. Closed8192B body contains only action,
input,inputRevisionId,inputHash,resultId,resultHash. Reuse strict depth12 parser,
UTF8/duplicate rejection, cancellation and original single10s request deadline.
Original v1 and author action paths retain behavior.

Add a private immutable research_reviewer_assignments_v2 row, at most one per
original job/attempt and author result. Bind original input/result IDs/hashes,
author assignment, independently authenticated reviewer principal, original work
owner, exact counter_review reservation and original job deadline. The original
work owner is a controller queue owner, not the author's/reviewer's credential
identity; keep it unchanged as the execution-binding contract requires. Never
copy any credential into model data, create production principals or infer an
actual model execution merely from an assignment.

Before every admission/read/packet, the server derives the expected current author
principal from its configured author credential, alongside the authenticated
reviewer principal. A small configuration-only identity helper validates the same
credential pair/role aliases and hashes the author domain; it never constructs or
sends a fake author Bearer request, exports a credential or accepts a caller hash.
The private SQL context requires this server-derived expected author principal
to equal the immutable author assignment principal, then calls the original
handoff context with that matched value. Merely reusing the stored principal is
forbidden: role-domain separation alone would let old author key A become the
reviewer after changing author to B and reviewer to A. Original author rotation
must reject instead of adopting the old assignment. Reviewer principal must also
match an existing reviewer assignment on every replay; current author/reviewer
configuration aliases remain invalid. Require exact completed receipt and all
original source/claim/lineage/clock fences. Author result/completed reservation
remain immutable. Application revalidates the complete revision, actual calculator
and entire stored validated article before reserve and replay.

Under original source→global locks, call existing reserve_research_model_v1 with
role counter_review, original work owner and deterministic work key binding job,
attempt and immutable author result. Reserve before any future reviewer dispatch.
Global1, fixed1800second charge,7200daily budget and Taipei day guard remain.
If no slot/budget, return explicit null without assignment or other writes. If
assignment already exists, validate it and return original bytes without reserve
or charge. Reservation plus assignment insertion is one transaction; failure
rolls both back. Final clock checks keep the original job deadline; counter-review
lease cannot extend it. No job renewals, retries beyond original limits or refunds.

Read requires original assignment, active exact counter_review reservation and
no reviewer completion. Preserve reservation/job original clocks and verify
assigned_at >= reservation.started_at and before both deadlines. Identity/owner/
role/work key/attempt changes, author result/hash changes, expired/taken-over jobs,
source changes or already completed reviewer reservation reject. Author's old
active-work reader remains rejected after handoff. Future review result/completion
and publication need their own explicit reviewed continuation; do not make this
reader into a completion/audit escape hatch.

Reviewer packet contains original raw article, immutable validated calculation,
tables and valuation sensitivities, financial projection/assumptions/gaps, and
selected public title/summary/catalyst/risk/source descriptors. Sources must be
resolved from the original sealed rows under the same source fence, with the
same author-packet rights, scope, unknown publication precision, seal admitted
clock and byte limits. No raw fulltext/private content or new sources silently
enter. A private pure source projection helper may reuse the original projection
logic without loosening original author context fences; any refactor must preserve
original author behavior and regression coverage.

Build a deterministic packet from immutable row/input/result and public source
projection, bind reviewer assignment ID, author article/result hash, input hash,
original clocks and calculator fingerprint. Max1048576 serialized UTF8 bytes,
max30 sources and307200 source bytes. Check limits before heavy processing and
after response serialization; all IDs/owners/principals/job and reservation keys
not needed for review prose stay outside the model packet. Complete packet hash
is recomputed at future review receipt; no dispatch here. Sources are explicitly
untrusted evidence, article/calculation remains contract-valid only, capabilities
remain false, and exact packet replay is unchanged within the same supported
runtime; changed compiled execution fingerprint rejects rather than laundering
an old result into a new execution version.

Acceptance: separate credentials/closedbody/exact+1/deadline/cancel; actual fixed
AUO/EMC recalculation with explicitly synthetic upstream/execution fixtures;
real PG original budget reserve and observed claim/completion fences; missing
handoff rejects; null budget admission has zero writes; exact concurrent reserve
one assignment/one1800charge; replay/read/restart unchanged; source withdrawal,
expiry/takeover/author rotation/reviewer rotation/A-R swap/old-author-as-reviewer/
completed review reservation reject before any reservation or assignment writes; no private
model context or fulltext; no completion/job/publication/qualification writes.
Independent design/code review, related tests/type/lint/normal build and native
HTTP required. Actual author/reviewer tool dispatch remains separate incomplete
acceptance, not substituted by this reservation/packet or engineering turns.

## Preserved design finding

Exact3c030556 unsigned review found P2 credential-rotation adoption: original
H(author,A), then configured authorB/reviewerA gives H(reviewer,A) distinct from
the stored principal. The design now requires the current server-derived author
principal as well. Original rejected design and reviewer probe remain historical;
this correction is not acceptance or authorization of any actual role execution.

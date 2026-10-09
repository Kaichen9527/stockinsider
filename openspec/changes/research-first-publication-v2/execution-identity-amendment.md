# Bounded execution identity foundation — 2026-10-09

This implements only private pure authentication/result-binding helpers for the approved v2 branch. It does not dispatch a model, create an assignment/reservation, publish research, change v1, or prove a real author/reviewer invocation. Database assignment admission and authenticated endpoint integration remain required.

## Available authority

The genuine existing server authority is INTERNAL_API_KEY for the trusted author controller and a separately configured RESEARCH_REVIEW_KEY for the trusted reviewer controller. There is no verified model/person principal registry. Resolve a private credential principal only after exact Bearer authentication, reject x-internal-key, missing credentials and any shared writer/reviewer/cron credential. Hash the matched credential with a role-specific domain; distinguish both credentials before hashing. The principal denotes a controller credential, not a human, model or provider account. Rotation cannot adopt an old assignment. Never expose credentials or their principal hashes in public articles, general logs, Git receipts or model prompts.

## Trusted observation boundary

The authenticated controller may report its actual tool-observed dispatch/completion. That is `trusted_controller_observation`, not a provider signature or platform attestation. The adapter must obtain these values from the actual tool return/journal; a model response or manual JSON file is not the adapter. Unknown provider model identity remains null. A thread/invocation string and its hash do not independently prove that execution happened.

The future route loads an immutable assignment and its original job/reservation from private storage, resolves the request identity, then calls the binding helper. The trusted expected context includes original work owner, job/attempt/reservation, input revision/hash, assignment, role, original job deadline, reservation clocks, article/review-pack/output hashes and server receive time. None of these expected values comes from the model/result body. Closed result shapes bind all those identities and hashes. Dispatch must follow assignment and reservation; completion must follow dispatch, precede real receive and remain within both original deadlines. Review also follows the stored article-authored time.

Review requires a separately authenticated principal and a different actual thread and invocation from the stored author observation. Merely renaming a reviewer or starting another turn in the author's thread does not establish this pilot's independence. Global invocation uniqueness/replay and atomic reservation completion must be enforced by the future transaction; the helper's provided prior-invocation set is defense in depth, not a concurrency lock. Exact accepted result replay belongs to the immutable receipt transaction, not a new assignment or budget charge.

Original clocks accept explicit ISO8601 Z/offset timestamps with zero to six fractional digits and offsets up to14:00; comparisons retain microseconds as integers. Adapters must preserve original database clocks, not truncate them to JavaScript milliseconds. Unsupported precision/offsets fail closed. No leap-second interpretation is claimed.

## Acceptance and remaining work

Unit/adversarial tests exercise credential separation, header aliases, rotation, mixed identifiers/hashes, unknown keys, role/owner mismatch, deadline/time bounds, self-review and invocation reuse. Synthetic test keys and observations are explicitly isolated fixtures, never real execution evidence. A normal build confirms the foundation compiles. Independent code review is required before integration.

Still required: private create-only assignments and uniqueness constraints; original owner/lease/source fences; original fixed budgets; actual cross-chat dispatch/result adapter; guarded v2 handoff/review integration; transaction/replay/concurrency tests; and fresh real author/reviewer execution for two company-specific articles. This increment cannot make those items green.

The initial eb9276a6 review found the cron=writer configuration omitted from the rejection. That synthetic P2 is retained; the successor explicitly rejects it for both roles and adds regression coverage. The initial11 passing tests did not detect that omission and are not treated as independent acceptance.

# Implementation plan

Extend only `scripts/research-monitor-controller.mjs` and its focused tests;
extract a small pure progress helper if necessary. Keep the existing first-batch
compatibility and existing authenticated endpoints. Validate local predecessor
files before transport, then validate fresh worklist/book bindings before any
snapshot mutation. Use compact cumulative audit dispositions rather than copying
all previous journals into each new journal. Source commit changes require a new
cycle, not retroactive rewriting of old receipts.

Requirements and architecture receive independent review before code. The maker
implements and runs focused lightweight tests; the existing Cloud VM verifies
integration in its single-heavy-job queue. All code changes still require the
normal build. Final exact-code review and draft PR precede any release. Protected
review, production migration/deployment and actual daily acceptance remain open.

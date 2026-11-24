# GitHub recovery contract

GitHub is the final recoverable source for ordinary-sized code and durable development knowledge. Keep the existing tracker/current-state authority; retain the selected project's designated memory and tracker. A convenience HANDOFF may point there but must not become a second independent truth.

## Store and index

- Source, dependency lockfiles, migrations and environment/bootstrap recipes.
- Current approved spec/AC, task IDs, dependencies, scope revisions and user decisions.
- A short current handoff with exact next action and source/candidate identity.
- Append-only compact decision and failure-history entries, rejected hypotheses and cumulative attempt/budget summaries.
- Tests and small evidence receipts. Large data/binaries/logs live in approved storage; commit a manifest with size/hash/retention/retrieval method and tested readback status.
- The selected project's reusable Skill/profile/client prompts and version provenance.

Do not commit passwords, tokens, .env secrets, signing keys, real user/health/financial records, private databases, huge raw logs, build trees, dependency folders or unrelated WIP. Review the actual staged paths/diff; an ignore file alone is not a secret audit. Git LFS, Releases and workflow artifacts have their own quotas/expiry, not unlimited free archival.

## Checkpoint conditions

Checkpoint after a meaningful accepted slice, useful diagnosis, confirmed decision, before host/model handoff and when the authorized run budget ends. A soft 20–30 minute reminder for active changes is a starting policy, not permission for meaningless empty commits or interrupted transactions. Use explicit owned paths rather than `git add .` on a mixed worktree. Record incomplete work honestly; do not turn a backup commit into a PASS.

After push, compare the intended commit to the actual remote branch head or connector readback. When another writer has advanced it, reconcile ancestry/content rather than force-push. Source push, task-state push, artifact readback, feature acceptance and deployment are separate receipts. If push fails, set checkpoint_pending and protect the unique local state; bounded retry does not imply success.

## Recovery on another client/host

Read the versioned short entry, relevant tracker and provenance. Fetch the correct branch, inspect HEAD and ownership, then restore necessary artifact inputs by verified manifest. Restore attempts, research clocks and unresolved-run records; a fresh checkout does not reset budgets. Verify actual capabilities and a focused command. Continue from the recorded next step after the user's applicable resumption confirmation.

## Support-branch adoption

A documentation/Skill support branch preserves this delivery kit without changing a live writer's branch. Record its exact branch/commit and review/install instructions. Adoption on the active branch needs a clean, scoped integration that preserves dirty work. Do not claim that a published support branch has installed hooks, replaced local instructions, saved all WIP or updated production.

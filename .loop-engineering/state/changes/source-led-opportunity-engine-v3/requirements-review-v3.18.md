# V3.18 fresh Requirements review — bounded pooler RPC repair closure

Date: 2026-08-23
Review authority: independent, read-only Requirements review of the immutable
V3.18 pooler-deadline repair tree.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `6d89cedda35ce29b66b67b796b9f356c807ba535`
- Final repair-closure commit/tree: `25eb4ecb92fed0112500ddd6caaeef147ecc67c5` / `99fc72aa88c700c514f52ea1e559b76d66ec37f4`
- Full reviewed range: `6d89cedda35ce29b66b67b796b9f356c807ba535..25eb4ecb92fed0112500ddd6caaeef147ecc67c5`
- Active graph: `729370999da4668cc5d8291e0e160a44c2d1a14edaae9a871f95be9e0203ac6d`

## Requirements closure

The repair closes the P1 producer-liveness failure found during the first
reviewed runtime activation attempt. The general database pool could wait on a
transaction-pooler operation without a query or statement deadline. The
separate heartbeat client could therefore stop renewing a 120-second lease
while the outer producer remained awaiting a non-terminal pool query.

Every pooled, non-claim RPC now has both a 20-second client query deadline and
a 20-second server statement deadline. This is below the lease duration and
ensures the durable job reaches a typed terminal failure instead of remaining
`running`. The repair deliberately introduces no generic mutation retry: only
the already-specialized idempotent claim path may retry its allowlisted
transport condition. A lost append/completion response remains fail-closed and
is resumed only from its immutable predecessor on a later reviewed run.

No candidate rule, valuation, source acquisition, decision threshold,
migration, credential, runtime mode, notification, automated-trading or
Promotion behavior changes in this repair.

The V3.18 tree preserves source-led nomination. Only approved, entity-linked
public source evidence can nominate a research candidate; official TWSE, TPEx
and MOPS facts can validate, enrich or reject it, but cannot silently turn into
an all-market discovery source. Paid InvestAnchors text and Telegram content
remain outside acquisition, and missing third-party OAuth is retained as a
typed terminal outcome rather than fabricated content.

`CandidateLedgerV318` retains last-good, source-linked candidates for exactly
twenty completed source sessions. A no-new, OAuth-unavailable or provider-
unavailable session retains the cited candidate without re-promoting it; the
same frozen-cutoff retry does not consume an extra session; only session 21
expires it. An individual evidence or fact deficit downgrades only the card
to a typed research/readiness state, while an integrity/checksum conflict alone
may fail closed globally.

The Decision Envelope remains the only action authority. The new research
readiness envelope affects visibility and lane placement only, so no missing
valuation, incomplete technical history or stale source can become a buy-like
recommendation. Every visible card carries one decision revision and its
compact landing representation contains only bounded decision data. The same
revision owns the full V3.18 dossier with valuation bridge/scenarios,
fundamentals, technical condition, thesis, risks, citations, dates and exact
blockers; missing data stay explicit rather than being translated to `avoid`.

The rebase includes the V3.17 amendment named by the active catalog before the
V3.18 layer, so the protected tree can recompute its entire graph rather than
referencing a missing predecessor artifact. Runtime and Web accept the additive
V3.18 projection schema together. The
runtime bundle includes the dossier module, every daily/hot/weekly card's
revision is persisted, decision detail returns the exact revision-bound
dossier, and the CTA foreground is explicit in both themes. The additive
candidate-ledger migration remains rehearsal-only. No database password reset,
credential rotation, LINE, dispatch, automated trading, V3 activation or
Promotion is introduced.

The Shadow harness admits `PATH` only when it equals its existing closed,
allowlisted executable path. This preserves the zero-ambient-variable boundary
while permitting the project-local npm and Playwright processes required by the
PCR browser checks; arbitrary PATH injection remains rejected.

## Executable evidence examined

- Product correctness suite: `129/129` PASS, zero failed, skipped or todo. It
  includes PCR-001 through PCR-031 and the V3.13–V3.18 regression owners.
- The added structural assertion verifies every general `Pool` construction in
  the producer adapter supplies both bounded `query_timeout` and
  `statement_timeout` values.

These are local diagnostics, not a protected artifact. This Requirements PASS
authorizes exactly one independent Architecture review. It does not authorize
migration, runtime activation, production deployment or a claim that future
returns have been proven. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` until real cohorts mature.

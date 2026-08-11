# Requirements Round 123 — two P1 repair

Round 123 reviewed commit `aa6579499e748457b10d7b53552beb9065983a06`, tree
`a284dab3aff9bb1dd2769b50ea3392aae5d71e99`, and returned
`CHANGES_REQUIRED P0=0 P1=2 P2=0`. This repair closes both remaining roots as one
decision-publication authority change:

1. `/stock/[symbol]` is now a closed, read-only decision-revision route. A generic
   symbol read resolves the current authoritative compact-projection card; an exact
   link resolves that immutable revision. Missing, malformed, stale or inconsistent
   authority returns typed unavailable. The public route no longer reaches legacy
   stance labels, refresh mutation, trade/chip summaries, technical entry geometry or
   next-session playbooks.
2. Runtime, SQL and revision UI independently require a parseable credential-free
   HTTPS URL, nonempty source identity/name, valid ordered published/collected/evaluated
   instants, exactly six unique thesis/risk point mappings, nonempty unique resolvable
   refs, unique citations and matching primary provenance. SQL normalizes malformed
   timestamp failures to `data_integrity_failure` and preserves zero-write atomicity.

Regression coverage includes prefix-only/credentialed URLs, malformed and inverted
dates, a seventh mapping, duplicate points/refs, empty provenance, missing generic
authority and stale projection. Fresh diagnostics pass V3.13 `11/11`, product
correctness `49/49`, applied migration `46/46`, Playwright `3/3`, typecheck, lint,
performance `4/4` and production build.
No production database, runtime, scheduler, credential, flag, deployment or source
state changed. The next step is a new immutable Round 124 subject and independent fresh
Requirements review.

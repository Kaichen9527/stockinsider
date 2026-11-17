# Civil sessions and actual quote knowledge clocks

Public source `2928fe9e0a47a039df23d18e2c8ca6a15509e935` exactly equals locally checked
`7390267cef3f743117cef46f0e579de1a852bcc8` whole tree
`323cf6b7e9d95bcc5bf83dcf83df9ff3d0fe2983`.
[Source hashes, checks, first failures and scope](weekly-quote-clock-checks.json).

Current weekly derivation no longer treats a trading-session date as its observation time.
Session, quoteAt and valuationAt retain existing civil-date/public-contract identities.
Separate quoteObservedAt/quoteKnownAt carry actual zone-bearing instants, observed<=known
<=cutoff, with exact microseconds. Missing, bare, reversed or future clocks leave explicit
gaps; neither arbitrary midnight nor the current cutoff fills them. Civil comparisons use
Taipei dates. Valuation/checklist time guards require the new real clock fields, without a
caller-controlled downgrade to old date-as-instant behavior. Financial/semantic/market
observations retain their own clocks and never borrow the quote clock.

The existing selected-price comparison carries its actual source/recorded/available lineage;
it remains comparison-only. Formal audit.quote is still exactly null because rights/action/
price authority is unresolved. This temporal repair cannot create quote, financial, model,
review or publication permission. Existing weights, thresholds, frozen snapshots and old
civil identities remain intact.

Two STATIC source tests PASS, five temporal cases PASS in each of UTC/Asia-Taipei/New-York,
138 related cases PASS, and types/lint/build PASS; zero skips. Node TZ variation is not an
OS clock change or real session acceptance. The additive private SQL body candidate preserves
old owner/ACL/namespace guards and exact predecessor3296/12b3→successor4496/fa2; it was only
read/reconstructed, never executed. Actual PostgreSQL timezone, syntax, ACL/RLS and native
acceptance remain NOT_RUN. The native fixture source adds two explicit synthetic clock
properties only; its assertions/pins/guards are unchanged and the script was NOT_RUN.

The first6969 check retained five passing temporal cases and one failed shared static case
in each TZ;129/138 related cases passed,9 failed, while types/lint/build passed. Root's first
driver mistakenly repeated the shared static failure across the TZ matrix. The initial
SQL-defect inference was corrected before edits: SQL fragments each occur once and the
successor hash was already correct. JavaScript replacement-string `$'` expanded an original
suffix and corrupted only the test reconstruction. Literal callback replacement repairs that
harness; closed loaders now read actual helper dependencies and the formatter reference gets
actual evidenceInstant. No acceptance assertions, product SQL or production modules changed
in that repair. Static checks now run once first, and any failure marks later jobs NOT_RUN
and stops. Independent source/driver review preceded the single local-HOLD retry. All first
failures and the corrected causal diagnosis remain in the receipt.

External1b2e45d source trace is sanitized metadata, not raw native TAP or a rerun. Its absent
assertion line cannot establish the original failure's first cause. Reported matching cached
preparation hash/IR lineage does not resolve the concrete original preflight assertion.
Formal A1, native HOLD, genuine quote authority and release gates remain unchanged. Original
PR head/services/flags/timers were untouched;283 originals unchanged/missing0 is preservation,
not an archive, recovery proof or reclaimed capacity.

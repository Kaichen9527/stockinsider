# Requirements Round 125 P1 Repair

Round 125 reviewed commit `6b5b75fb9eff7533791a9493cedfdcefb9465e3a`
(tree `7abac8d161b8084a8ab86efdde991edef3359901`) and returned
`CHANGES_REQUIRED P0=0 P1=4 P2=0`.

The repair closes the four roots as one decision-integrity boundary:

- technical, deep-dive and insight reject duplicate or malformed revision query
  parameters before redirect or data access; browser regressions cover all three;
- one closed DecisionEnvelope validator is implemented independently in runtime,
  Web and SQL, including exact 15% upside/discount, 2.0 reward/risk, method, as-of,
  source, geometry, missing-to-unavailable, nested equality and raw uniqueness;
- V3.13 Landing and compact projection readers validate every displayed source card
  before classification; malformed or duplicate cards fail closed;
- SQL publication grammar now matches Web for timestamp components, trimmed 3+3
  text and string-typed citation/provenance fields;
- source acquisition and SQL item/document boundaries require credential-free HTTPS
  and offset-bearing timestamps while preserving legal Threads `@profile` paths.

Regression work also found and repaired a producer closed-union defect: formal
envelopes had retained relative-band fields and were therefore rejected by the now
correct validator. Formal output now contains only formal valuation members.

One serialized product/runtime diagnostic passes: typecheck, lint, production
build, base `61/61`, product/V3.13 `49/49`, migration `47/47`, legacy `2/2`,
Playwright `3/3`, and performance `4/4`. Model runner passes `17/17`; doctor returns
`pass` for disabled deployment with `model-runner-host-pins-v3.7`.
No production operation was performed.

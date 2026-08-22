# V3.18 exact repair diff review — retained-candidate ledger compatibility

Date: 2026-08-23
Reviewer: independent exact-range review after the first production producer
run failed safely during candidate-funnel completion.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Exact subject

- Protected main parent: `4edbe1b9c228455371ab0127ce02e3ab45089885`
- Final reviewed repair/tree: `15cb3a2c1afd701587e4a34ab99a73d26434f258` / `78f77cf17ee82e386ce8154cbae539093b524404`
- Full final range: `4edbe1b9c228455371ab0127ce02e3ab45089885..15cb3a2c1afd701587e4a34ab99a73d26434f258`
- Active graph: `729370999da4668cc5d8291e0e160a44c2d1a14edaae9a871f95be9e0203ac6d`

## Review result

The failed run exposed a closed SQL enum boundary: V3.18's two user-visible
retention explanations were passed through the legacy `reason` field, while
the durable discovery ledger only admits existing reason values. The repair
keeps the durable field at `same_material_evidence` and carries the precise
V3.18 explanation in additive `retentionReason` metadata. It changes no
candidate selection, retention duration, source input, valuation, decision,
migration, environment, credential, notification, automated-trading or
Promotion behavior.

The focused V3.18 source-led suite passes 7/7. The migration contract suite
passes, and the complete product-correctness run passed after installing the
locked web test dependencies; its browser run records no failed tests. The
PCR fulfillment carrier binds the same 31 immutable boundaries to this exact
commit/tree.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`; no cohort or market
outcome has been fabricated.

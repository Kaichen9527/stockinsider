# StockInsider V3.14 — Requirements Round 133 P1 Repair

Round 133 reviewed commit `bbddc4a9eea407ba223c7e1365036e321c6fd592`,
tree `901eb5940508c6afbc225292234e30b924e0c255`, and returned
`CHANGES_REQUIRED P0=0 P1=1 P2=0`.

The executable registry now requires all 140 explicit non-PCR suite mappings, which
matches the canonical evidence contract and the 128 pre-existing cases plus the 12
V3.14 `REC` owners. This removes the pre-owner `140 !== 128` protected-trace failure.

This is repair evidence, not a gate PASS. A new immutable tree and independent fresh
Requirements Round 134 remain mandatory. No production state changed.

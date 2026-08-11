# Requirements Round 126 P1 Repair

Round 126 reviewed commit `994f29af53eefd854d395b5fd346dcf02b0c5ddd`
(tree `d189afe83012f85b5f147258f203bc5a14c8cf05`) and returned
`CHANGES_REQUIRED P0=0 P1=4 P2=0`.

The repair closes the findings as two shared authority roots:

- Decision thresholds now persist raw formal or relative authority. Runtime, Web
  and SQL recompute Base upside, reward/risk and relative discount from that authority;
  only machine-precision equality is tolerated. Exact 15%/2.0 passes while
  14.99%/1.999 and forged rounded scalars fail. Conditional authority retains and
  validates 252 history sessions and at least eight peers.
- The entry plan is a closed state-specific union. Tradable and breakout-pending
  states carry valid long geometry; below-support/reclaim/extended states carry a
  trigger with null entry/stop; invalidated carries neither. The production decision
  owner exercises every wait/avoid action, and Runtime, Web and SQL agree.
- Missing quality or market authority remains `unavailable` while preserving its
  valuation provenance. SQL now accepts and persists the same typed state accepted
  by Runtime and Web; no buy-like action is enabled.

Regression coverage includes exact and just-below thresholds, forged relative
discount, 251/252 sessions, 7/8 peers, all conditional technical states, production
action derivation, compact persistence, and the Landing/detail nullable-entry UI.

One serialized product/runtime diagnostic passes: typecheck, lint, production
build, base `61/61`, product/V3.13 `49/49`, migration `47/47`, legacy `2/2`,
Playwright `3/3`, and performance `4/4`. Model runner passes `17/17`; doctor returns
`pass` for disabled deployment with `model-runner-host-pins-v3.7`. The external gate
attestation was not claimed because no protected external envelope was supplied to
this local repair run. No production operation was performed.

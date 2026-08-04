# Requirements Round 82 P1 Repair

## Scope

This repair is derived from the immutable Requirements subject
`c910e03858cd7e95c1ebb4035140be39d97124b0`. It changes only the cited
requirements/contracts, canonical acceptance authority and package-script surface for
Round 82 P1-1 through P1-7. It neither implements the V3 runtime nor authorizes a
migration, scheduler install, shadow activation, deploy, merge or production write.

## Repairs

| Finding | Repair |
|---|---|
| P1-1 executable acceptance authority | Root/Web package scripts now contain every one of the 12 canonical `scriptValueRows`, including legacy regression, performance, exact model-runner test, Web E2E and the threshold-bearing evaluation command. The traceability meta-test compares the exact ordered 12-key set and every root/Web value, and its stale 266 uniqueness assertion is corrected to 297. |
| P1-2 BIAS 877-session construction | The history plane is explicitly seven bounded 132-session unique chunks with 120-row adjacent overlap. Its 1,597-row maximum retains distinct anchor evidence for duplicated raw sessions while every adjustment tuple remains within the existing 252-intervening-session authority bound; each selected 877-session history yields exactly 756 endpoint values. |
| P1-3 BIAS precedence/boundaries | Own BIAS labels now use exact first-match quantile boundaries. `below_support`, `reclaim_required` and `invalidated` are a defined technical hard block before the BIAS safety cap; the decision sequence returns the owning technical block rather than mislabelling it `bias_observe_only`. |
| P1-4 official PE reproducibility | Official PE rows bind exchange `sessionAuthorityId`; the reported-PE manifest binds `tradingCalendarWindowHash`, distinguishes share-free own-history rows from sector-current rows and defines the historical official shares selector and typed calendar failure. |
| P1-5 quality construction/availability | The bounded financial loader owns paired latest/four-quarter-earlier instant `invested_capital` and `total_assets` rows. Quality is available only at aggregate available weight >=0.65; below that it is unavailable with an exact quality reason. Component nullability and aggregate score rules agree. |
| P1-6 public factor/no-change closure | The public material-change limit is seven everywhere, legacy radar includes `factor_correctness_changed`, factor-axis branches have status-dependent reason/score/nullability, and the valuation axis has closed 20/15/30/20/15 weights with no partial renormalization. |
| P1-7 static identity | The six active RFC 8785 owner hashes are stated and independently reproduce the 2,729-byte comparison preimage SHA-256 `3742472bdfaf16c99a179e24816cfad6d9536c7ef5143a2ba6121ed386b58942`; acceptance text and traceability expectation use the same value. |

## Mechanical checks recorded before fresh review

- Root package, Web package and canonical acceptance inventory parse as JSON.
- The canonical 12 script rows reproduce their existing 2,023-byte SHA-256
  `d6caeb641cde6a2f07480704a6fe768f5dc4978d92bc958f0f2874cb94fbcd3e`.
- Substituting the six active owner hashes into the runtime static-member preimage
  produces exactly 41 members, 2,729 bytes and the Round 82 repair digest above.
- This is requirements-repair evidence, not Code Gate evidence. The seven named
  PCR-025 through PCR-031 implementation tests remain intentional RED baselines until
  the future implementation stage.

## Required next gate

An independent fresh Requirements Round 83 review must inspect the new immutable
subject tree, reproduce the active graph and evaluate these repairs. Architecture and
implementation remain locked unless that review returns zero P0/P1.

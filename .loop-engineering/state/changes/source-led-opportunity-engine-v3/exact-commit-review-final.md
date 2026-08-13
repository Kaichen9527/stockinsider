# V3.15 opportunity-recovery final exact-commit review

Date: 2026-08-13
Reviewer: Codex Sol independent read-only review
Review mode: exact implementation, repair closure and complete final range
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subjects

- Reviewed base: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd`
- Exact implementation commit/tree: `97bc7de9027e8f334f9343aa1552d7b7bb33fce2` / `fe2752f1aca66766cdca7710e8577e0799509aa0`
- Final reviewed repair/tree: `50850e84710cd6756dbdfae1cd05d2a89a04939b` / `7fdec974fb42953365725e0b73b7e1f7e2d26416`
- Full final range: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd..50850e84710cd6756dbdfae1cd05d2a89a04939b`
- Active graph: `b7cb7c7aef9a4ed283c066a9128605aa0348f3526aade2adb1b559893707ac7b`
- PCR fulfillment record: `pcr-fulfillment-record-v1.json`

## Exact review and closure

1. Official whole-market data supplies only research ranking and enters the existing
   bounded 60→30→20 funnel. It cannot write an action. The unique decision envelope
   still requires official point-in-time valuation, adjusted technical, quality and
   market authority; no daily buy quota exists.
2. TPEX history uses the provider's Gregorian request form, carries the exact source
   URL, converts lots/thousands to shares/TWD and accepts compact official ROC action
   dates. Live provider inspection confirmed the declared response units and shape.
3. Monthly revenue preserves reporting period, filing instant, unit and source. Both
   deep and coarse paths reject filings published after the run cutoff. The negative
   fixture proves a July value filed on August 14 cannot enter an August 13 replay.
4. The runtime no longer needs a database password. Its allowlisted Keychain references
   resolve Supabase HTTPS REST credentials, and the REST claim restores the same frozen
   authority hash used by the PostgreSQL adapter. Errors never serialize credentials.
5. The doctor does not receive SELECT on private producer run/job tables. A bounded
   security-definer RPC returns only its last-run, lease and stuck-count inputs. The
   service role receives execute only on the REST claim/health functions.
6. The V3.15 migration is additive, advisory-compatible and apply-twice safe. It ranks
   the latest recorded instrument before active filtering, so historical active rows
   cannot revive a delisted security. RLS and append-only write guards remain intact.
7. Complete verification passed typecheck, lint, production build, core 61/61, product
   correctness 92/92, migration 51/51, legacy 2/2, Playwright 8/8, performance 4/4,
   model-runner 17/17 and disabled host-pin v3.8 doctor. Root and Web dependency audits
   report zero vulnerabilities.
8. The exact review found two P1 issues, future filing leakage and the REST doctor
   privilege mismatch. Repair-range and complete full-range closure each returned
   `PASS P0=0 P1=0 P2=0` after regression coverage and fresh reruns.

## Closure result

- Exact implementation review: `CHANGES_REQUIRED P0=0 P1=2 P2=0`
- Repair range review: `PASS P0=0 P1=0 P2=0`
- Full final range review: `PASS P0=0 P1=0 P2=0`

## Authority boundary

This review authorizes the already-approved coordinated V3.15 Web, additive migration
and tracked producer activation. It does not enable LINE, dispatch, automatic trading
or V3 Promotion. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` until real elapsed cohorts exist.

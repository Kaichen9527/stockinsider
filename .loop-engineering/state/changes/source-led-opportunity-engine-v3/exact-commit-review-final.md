# V3.15 opportunity-recovery final exact-commit review

Date: 2026-08-13
Reviewer: Codex Sol independent read-only review
Review mode: exact implementation, production-compatibility repair closure and complete final range
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subjects

- Reviewed base: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd`
- Exact implementation commit/tree: `f0ec19ad10b1edc38457c800f3ee1eb946b35c77` / `43bd8e5ab7c5cdcff9ff65dd5d2c6f953c1e8ca7`
- Final reviewed repair/tree: `af03f394ac260a9b77055c653040b4ad7b6face8` / `21b26a8945a79ecd1c9c1d67b29f79a4bb5790a9`
- Full final range: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd..af03f394ac260a9b77055c653040b4ad7b6face8`
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
   fixture proves a value filed after the cutoff cannot enter an earlier replay.
4. The runtime uses allowlisted Keychain Supabase HTTPS REST credentials. The REST
   claim restores the same frozen authority hash used by the PostgreSQL adapter, and
   typed errors never serialize credentials or SQL text.
5. The doctor has no SELECT on private producer run/job tables. One bounded
   security-definer RPC returns only last-run, lease and stuck-count inputs. The
   service role receives execute only on the REST claim and health functions.
6. Production rehearsal found the V3.14 identity upgrade accepted only the fresh-tree
   `1.45.1` predecessor while the deployed legal predecessor was `1.44.6`. The repair
   admits exactly those two historical versions and their two comparison identities,
   converges each to `1.46.0`, and rejects missing, duplicate or mixed identities.
   Historical projection rows remain admissible for audit only. A PostgreSQL
   regression downgrades all four owning functions and applies the upgrade twice.
7. The migrations remain additive and apply-twice safe. Latest-recorded instrument
   authority is selected before active filtering, so historical active rows cannot
   revive a delisted security. RLS, append-only guards and rollback boundaries remain.
8. Complete verification passed typecheck, lint, production build, core 61/61,
   product correctness 92/92, migration 52/52, legacy 2/2, Playwright 8/8,
   performance 4/4, model-runner 17/17 and disabled host-pin v3.8 doctor. Root and Web
   dependency audits report zero vulnerabilities.

## Closure result

- Original exact implementation review: `CHANGES_REQUIRED P0=0 P1=2 P2=0`
- Original repair and full-range closure: `PASS P0=0 P1=0 P2=0`
- Production predecessor rehearsal: `CHANGES_REQUIRED P0=0 P1=1 P2=0`
- Compatibility repair range review: `PASS P0=0 P1=0 P2=0`
- Complete final range review: `PASS P0=0 P1=0 P2=0`

## Authority boundary

This review authorizes the already-approved coordinated V3.15 Web, additive migration
and tracked producer activation. It does not enable LINE, dispatch, automatic trading
or V3 Promotion. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` until real elapsed cohorts exist.

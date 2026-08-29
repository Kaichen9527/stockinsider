# V3.20 exact implementation diff review — expired unclaimed-run repair

Date: 2026-08-30

Review authority: read-only examination of the full immutable V3.20 protected-base
range and the focused runtime-recovery delta. This review did not mutate production
data, runtime, scheduler, Vercel, source providers, LINE, dispatch, automatic
trading, Promotion, or evaluation governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `f9f5b844cd5f701ad70a970eb2f443c256ff3cde` / `72eb812fb5fac90233b4bca41f8a2145e3eb714c`
- Full final range: `7f461e74dc7d786a455106e20551df13d2c9131f..f9f5b844cd5f701ad70a970eb2f443c256ff3cde`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The focused additive migration replaces only the exact-identity V3.20 reaper.
  It identifies exactly one expired `running` producer run matching the reviewed
  commit, worker, and scheduler-config hashes. It cannot act on another release.
- A run with a fresh leased job remains untouched. An expired run with an expired
  leased job retains the prior terminalization path. The new path applies only
  when no job is leased and one queued/retryable job exists; it writes the
  typed `lease_expired` diagnostic, fails that job, cancels only its remaining
  unclaimed siblings, and terminalizes the run as `failed_recoverable`.
- The function exposes no raw SQL, URL, payload, role, or credential data and
  grants execution only to `service_role`; no public table DML or broad cancel
  endpoint is introduced. The migration is additive and contains no DROP,
  TRUNCATE, or DELETE operation.
- The reviewed tree passed `git diff --check`, 76/76 migration-contract tests
  including double apply and the new unclaimed-run fixture, and 150/150
  product-correctness tests including all 31 PCR cases. Existing KOL-first
  nomination boundaries, financial/valuation gates, research-only fallbacks,
  and disabled V3 public endpoint remain unchanged.
- Output remains research-only until verified official facts, valuation,
  technical authority, and runtime health exist. No target price or buy action
  is fabricated, and evaluation governance remains non-fabricated/blocked.

## Closure

No P0, P1, or P2 finding remains. This reviewed tree is ready for the normal
protected Code Gate, followed by the bounded production migration, exact runtime
recovery, and read-only production verification.

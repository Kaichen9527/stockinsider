# Financial-series bound: minimal extraction audit

Read-only audit of main `0997336d0eb8ec43ea0899f22fe5a03cc774518f` against pending
PR364 `2e078dfdd74272d3d50dffdd4cc6c14df3152c78`. No SQL, DB/HTTP/crawl, tests,
build, cache cleanup or application changes were executed. Input byte/SHA/blob
identities are in the accompanying receipt/source manifest.

## What remains demonstrably missing

Main's `migrations/20260809_decision_integrity_v3_13.sql:570–596` still installs
`prepare_opportunity_financial_fact_series_v3()`: at 128 stored facts sharing
stock/fact/duration/estimate-kind/horizon, BEFORE INSERT raises PT409
`bound_violation`. It does not distinguish periods. The new
`20261005_financial_history_admission_v1.sql` is absent from main and its planner.
All 48 base migration files are byte-identical between these two subjects;
ordered SHA is `37dfacc252ec24a719b898b2b3ea31fc77c1631db083211f1f171c956772c613`.

This is a current **repository** gap. Root's 1723 `bound_violation` and 343
usable=0 diagnosis is supplied production evidence; this audit did not reread
production, and did not locate that specific 1723 event in the frozen financial
receipts searched. Existing dated documentation independently records older
2330/2605 fallback failures. Do not report production fixed, failure disappeared,
or every unusable candidate explained by this one trigger. Provider/parser,
validation receipts, missing financial fields and valuation/read bounds are
separate possible blockers requiring real accounting after the admitted repair.

## Narrow SQL and compatibility boundary

The pending 169-line financial amendment is logically separable from the new
research/author/reviewer/publication system. It:

- Reuses the series advisory lock/registry and deferred consistency checks.
  The new count applies to **one period_start/period_end**, and includes value,
  unit, provider, authority tier, source reference, restatement, publication and
  source clocks. At most 128 distinct period claims; a 129th rejects with
  `financial_period_revision_bound`. It is not a larger lifetime limit.
- Leaves original fact IDs, values and clocks intact; preserves the existing
  append signature and role validation by renaming its predecessor and wrapping
  it. Existing callers of `append_financial_fact_v3` need no JS/API rewrite.
- Adds immutable `opportunity_financial_observations_v1`, known-only legacy
  timestamp backfill, atomic RPC observations and two history/period indexes.
  RLS stays enabled; service_role gets SELECT, not direct writes; private
  predecessor EXECUTE and owner schema CREATE remain revoked.
- Adds an optional cutoff-keyset reader, 128 rows plus sentinel, stable
  recorded_at/fact_id cursor. It does not replace the existing candidate fact
  plane or guarantee consumer valuation completeness.

Direct SQL prerequisites already belong to the unchanged base chain:
`opportunity_financial_facts_v3`, series registry/trigger, enums and
`financial_fact_input_v3`, `internal_principal_role_is_exact_v3_internal`,
`opportunity_v3_rpc_owner`, pgcrypto/`extensions`, and
`legacy_correctness_immutable_v3_11`. The V3.16.16 recollection migration must
precede it: the amendment explicitly checks
`append_financial_fact_pre_v3_16_16` and preserves the current append wrapper.
No observed roster/deep job/article table is referenced by this SQL.

Undated fallback source/publication timestamps still participate in claim
identity; merely retrieving the same URL/value does not fabricate an earlier
known-at time. Legacy accounting scope/currency are explicitly unspecified.
Distinct providers/unit/restatement corrections remain visible. The original
candidate fact reader remains limited to 18 monthly periods/12 quarterly periods
and other finite windows; dense corrections may still visibly exceed downstream
payload bounds. No existing writer/strategy/qualification boundary is loosened.

## Installation is the real extraction dependency

Do **not** cherry-pick the complete pending planner/apply files as the minimal
fix. Pending `migration-plan.mjs` places this SQL sixth in a 27-migration research
extension; the apply path additionally requires research catalog, cloud/deep and
publication postconditions. That is incidental installer bundling, not a direct
financial SQL dependency. The pending code selects 76 files (one prelude + 48 base + 27 research tails).
The README still describes an earlier 73-selected/72-applied fixture. Those
dated full-research results cannot be relabeled as a current 76-file execution,
nor as an approved 49-file financial-only profile.

A narrow production-capable change still needs the following reviewed installer
behavior, adapted to the current main rather than copied wholesale:

1. Keep the exact 48 base list/digest; explicitly describe the financial tail
   and its exact hash in the existing plan/apply/attestation contract. A new
   narrower selection/profile requires root's scope decision and exact review;
   no such selection was implemented or authorized by this audit.
2. Detect an installed observation table/private history wrapper **before** any
   base mutation. Reject an omitted financial tail. Base-only replay can otherwise
   restore the old trigger/recollection function over the installed successor.
3. Apply selected predecessor chain + exact tail + postconditions in one shared
   locked transaction. Reuse the reviewed SQL-aware transaction-wrapper scanner;
   embedded control/nontransactional commands must fail, not be regex-stripped.
   Forced failure after old-body replacement must roll back to the successor.
4. Check the impacted signatures, body/owner/config/ACL/trigger/table/RLS/index
   profile before/after, including old wrapper provenance, apply-twice and partial
   residues. Do not adopt the unrelated publication first-install guard blindly:
   it intentionally forbids full publication replay and is a different scope.
5. Existing-VPS owner drift may need the separately pinned ownership prelude
   before replaying the full base. Its five legacy-function transfers are not
   a direct financial-tail dependency; verify the exact existing profile before
   deciding it is necessary. No new role or grant can be inferred by this audit.

Relevant reusable pending files are `migration-successor-guard.mjs` (currently
couples financial and cloud flags to research-extension),
`atomic-migration-chain.mjs`, their tests, `migration-sql-policy.mjs`, and the
existing planner/apply. The reviewed VPS schema-only fixture/catalog is useful
for a new financial-only native installation rehearsal, but its full publication
catalog cannot be relabeled as that profile.

## Reproduction and existing evidence (not rerun here)

Current main native negative entry:
`migration-contract.test.mjs:7615`, **V3.16.16 financial fact append is
recollection-idempotent and still rejects the 129th distinct series row**.
Pending same test remains at 7696; preserve it on the base-only fixture.

Pending tests at 8209 and 8309:

- **financial history amendment admits genuine periods, preserves PIT revisions
  and bounds pages on the real predecessor chain**: 160 months, unchanged fact
  ID on recollection/retry, later correction/unit/provider differentiation,
  cutoff pages 128+32, exact coverage, bad cursor/size/auth, 129th-period-claim
  rejection, RLS/ACL/private wrapper/owner CREATE checks and apply-twice.
- **financial atomic replay rollback retains installed successor after predecessor
  replacement and forced failure**: real old function replacement then rollback.

Only extract these financial hunks/import, not pending's unrelated PCR adapter,
publication, source-led and browser additions. Add adjacent guard/scanner/plan
regressions with the new narrower plan's real exact fields. Do not change any
approved canonical command/catalog merely to register this extraction.

Dated independent receipt `financial-history-independent-review.json` binds
`6899996a8e3006425bf5bc54777b90e6b0c51cc3`: unsigned scoped approval, original
checks and 10,000-fact warm synthetic index/heap/query measurements. It explicitly
has protected=false/productionApply=false. A later Linux full-schema installer
receipt at `1b67ee7f7e61f2394dbf4e42e045237bf651c0d3` exists in local Git;
that full-extension engineering result is separate from financial-only or live
production acceptance. No old measurement is used to override current capacity.

## Recommended smallest next slice

One narrow PR can contain the unchanged reviewed financial SQL + its two native
financial cases/spec + the minimum existing installer plan/atomic/successor/profile
integration, keeping all other research SQL out. Freeze that scope first. A
second consumer change is only necessary if actual post-repair bounded reads
remain insufficient; do not introduce a new financial queue or calculator system.

Acceptance before deployment: main baseline rejects period 129; amendment admits
>128 real periods without deleting history, recollection preserves IDs/clock
lineage, corrections stay distinct, period 129 rejects, cutoff pages account fully,
all negative rollback leaves facts/observations/audits unchanged, service/public
ACLs and owner profile unchanged, base-only/partial/replay/disconnect fail closed,
and the exact existing-schema financial-only installation is rehearsed. Production
apply and subsequent 343 coverage/usable accounting need root-controlled gates,
capacity and real receipts. This audit performs none of those actions.

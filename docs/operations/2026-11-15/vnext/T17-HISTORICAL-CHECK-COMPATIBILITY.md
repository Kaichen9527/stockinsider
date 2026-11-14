# T17 historical CHECK compatibility — staging clone only

The 56e7a9a onsite run was reported by the coordinating operator: PostgreSQL
17.11 restored the 2026-09-19 backup, observed820 public CHECKs (3 NOT VALID),
288 FKs (all validated), zero other unvalidated constraints and one matching
unvalidated paid-content tuple, then rejected and cleaned up in316.136s.
Production signatures were reported unchanged. This is onsite evidence supplied
by the operator, not Cloud runtime admission or proof of the three definitions.

The new internal evaluator runs only against the engine's newly owned clone.
It compiles three reference CHECKs in temporary PG17 tables from hash-pinned
2026-09-06/07 public migration source. It requires exact public table/name/type,
column identity, pg_catalog type OID/typmod/collation/nullability, conkey,
connoinherit and PG17 pg_get_expr canonical definition equality. No catalog
expression is executed. The later09/20 wider valuation definition is rejected.
The09/12 production hotfix requires financial status TEXT; the enum in a test
fixture grants no compatibility.

The only accepted profiles are paid_content_v4, financial_status_v6 and
valuation_method_v6. Each matching unvalidated profile must have zero rows for
its fixed source predicate IS FALSE; at most one instance of each and three
total are permitted. PostgreSQL CHECK semantics reject FALSE, not UNKNOWN.
The nullable valuation predicate explicitly allows NULL; paid content and
financial status retain their source NOT NULL requirement. No original row,
constraint, convalidated bit or backup is modified, and VALIDATE is never run.
Unknown CHECKs, mismatched definitions/types/columns, violations, unvalidated
FKs or other unvalidated types fail closed. Missing FKs still reject.

Successful compatibility does not finish database acceptance: the original
owner/portable contract, disarmed restored identity fence, seven named RLS and
SELECT grants, three routine EXECUTE grants and seven fixed lineage anti-joins
remain required. The receipt retains actual invalidConstraints (including
accepted historical NOT VALID bits) and adds bounded fixed-profile counts in
historicalCheckCompatibility. Failure diagnostics appear only after verified
owned-process/socket/tree cleanup. Names, expressions, SQL, row values and logs
are excluded. This source change does not accept a receipt or caller Boolean as
runtime authority and does not change historical disabled entry points or HOLD.

The historical migration audit documents that the later candidate explicitly
requires the financial CHECK to remain NOT VALID. Preserving its bit while
checking all existing rows on the clone is compatible with that requirement;
blanket validation would conflict. Actual September snapshot definitions and
row results remain UNKNOWN until the next onsite run of this version. Any
mismatch rejects rather than assuming the operator's three counts identify them.

Reproduce generated-public-only tests:

```sh
python3 -m unittest discover -s scripts/tests -p 'test_t17_*.py'
```

Use installed PostgreSQL17 tools and Node22 at the runner's existing fixed
reviewed locations, nonroot uid, private0700 scratch and Unix sockets. These
internal synthetic tests do not assert host namespace/cgroup admission. Cloud's
filesystem lacks fs-verity; kernel-held small fixture memfds remain test-only.
The runnable staging entry and FD3–8 host preparation are unchanged; onsite
must use the independently reviewed dedicated sandbox and its original binary
key-FD/held-fsverity-FD/two-pass GCM admission. No production credentials or data
were sent to Cloud. Service-provider recovery, Next rollback and production
continuity remain separate acceptance items.

T18 follow-up must use a fixed reviewed staging read point before clone cleanup,
after every DB check passes. The current DB-only entry has no command callback.
A09/19 snapshot must preserve its original date/stale status; missing genuine
radar snapshot/schema must be reported without synthetic backfill. Real Next
artifacts and a staging-only PostgREST/JWT/readonly role need separate evidence.

# Fixed enum-only detail JSON rejection diagnostics

Baseline e2af3017c5409dab0acb20bbdac3f7e60adad668 passed the host no-key and
invalid-key controls onsite. Its real run706.331s verified DB/old Next A/B/A/eight
negative boundaries/formal signatures/cleanup, but returned GAP_DETAIL_PUBLIC_JSON
and did not execute detail HTTP. Preserve exact evidence
cc139b9d06e4fcc031def93c48af078cf1ed9953 as
`contabo-t18-historical-detail-json-gap.json`, Gitblob
840eba03be384834773045c0ad26b410df921f82. Earlier successful receipts stay unchanged.

The later direct public observation79119dec1e1d86bba321288f5b4c426cdae66dbd
matched the same historical revision and identified an independent raw fact URL
query-host policy incompatibility. It does NOT establish which validator raised
first in the previous clone. This source neither retries the true backup nor
claims a cause, new detail HTTP acceptance or a compatibility fix.

## Two separate closed observations

Only GAP_DETAIL_PUBLIC_JSON may now contain:

- profileDiagnostic: exactly category and reason, each a compiled enum. This
  identifies the first failure in the original validator order on this run.
- rawFactUrlPolicy: a single compiled enum from a parallel pure policy probe.
  This is not first-exception attribution or authorization.

Synthetic example (NOT an observation of the previous real clone):

```json
{
  "status": "GAP_DETAIL_PUBLIC_JSON",
  "profileDiagnostic": {
    "category": "VALUATION",
    "reason": "UNSUPPORTED_FIELD"
  },
  "rawFactUrlPolicy": "REJECTED_QUERY_HOST_POLICY"
}
```

The example can occur when valuation fails before a later raw fact URL check.
Neither datum grants a reader/adapter/HTTP capability. Every rejection still
returns no private adapter; genuine data remains untouched.

Categories are ENVELOPE, BOUNDS, STOCK, DETAIL, SECTION, SOURCE_LINK, VALUATION,
TECHNICAL, VALUATION_HISTORY, RESEARCH_COVERAGE, BUSINESS_PROFILE, FORWARD_BVPS,
EARNINGS_BRIDGE, COMMON_INCOME_BRIDGE, EQUITY_BRIDGE, FACTOR, REVISION_CONTEXT,
FACT, FACT_URL, PUBLIC_LOCATOR, METADATA, METADATA_DATASET.

Reasons are OBJECT_TYPE, UNSUPPORTED_FIELD, MISSING_FIELD, FIELD_TYPE,
UNSUPPORTED_SEMANTICS, REFERENCE_SCOPE, URL_POLICY, URL_QUERY_HOST_POLICY,
BOUND_EXCEEDED, SENSITIVE_PATTERN, INVALID_PROFILE, FACTOR_STATUS, FACTOR_GRADE,
FACTOR_COUNT, FACTOR_RANGE. They are source-position classifications, never a
serialized actual field/key/index/type name/value/exception/SQL/row or private ID.

Raw URL policies are NOT_OBSERVED, ACCEPTED_URL_POLICY, REJECTED_URL_POLICY and
REJECTED_QUERY_HOST_POLICY. The bounded<=40-fact probe runs only after the original
JSON bound check and tests the unchanged raw validator. It returns only that enum,
performs no DNS/network request, stores no URL/host/query in diagnostics and clears
its parser cache. A bound failure or unusable set is NOT_OBSERVED. An accepted
raw policy is not a claim about browser sanitization, complete public evidence,
first-cause attribution or execution admission.

Exception strings remain fixed. A second exact-dict/exact-string/closed-enum
projection checks every diagnostic before stdout. Unknown or extra fields/types
are rejected, including diagnostics on any other GAP or successful HTTP receipt.
Legacy status-only GAP receipts remain readable; all native execution authority
still comes from the existing scoped OS/key/immutable archive/actual PG gates.

## Frozen consumer proof and unchanged policy

Both fixed refs169aad1b6cfa747f78ae3464b614f43c0749d806 and
 dd59817f750684b093965f539dd4de466be13077 were re-fetched and match:

| Source | Git blob |
| --- | --- |
| candidate-detail.ts | 37cb3fa5ad0046db3a03c5a73a3670fe2e16af56 |
| candidate-factor-builder.ts | 00e3f1454b8e41a7605c95cce007a41a5e705fad |
| tw-market.ts | d98636ebceeb53899f133bb8729cd899becc292c |
| internal/taiwan-data-queue-drain/route.ts | 86957cbe2072a2afe7165476d8d051e224a15163 |
| public-source-url.ts | 6c58c75d99928ab95107a21690e3cb108c539a53 |

The frozen public URL consumer can remove sensitive query keys and fragments;
it does not add query parameters. This does not prove that the raw staging gate
accepted a given original row. This delta does not call that sanitizer, rewrite
or repair any fact URL, broaden host/query rules, or export actual network data.
The four-host raw-query condition and all accepted/rejected predicates remain.

No new bridge/metadata/factor compatibility is authorized. Known incomplete
profiles remain as before; unknown/unproven shapes still reject. SQL, all SELECT
constants, RPC path,512KiB/40-fact limits and original schema/fact/PIT/JSON guards
are byte-identical to the public baseline where applicable. PROJECTION_SQL SHA256
is ec8876222dbb422aea43e1485abd4faad70809877c3458e6be8b14f33d444a15.

There are no new grants/roles/schema, original-RPC invocation, root/unit/broker/FD
changes, asset/pin changes or Cloud Contabo actions.900/300-second credentials,
original DB/daily checks, existing cleanup, HOLD and site/new-radar/formal gates
remain. Freshness/action and actual detail HTTP are not promoted by diagnostics.

## Validation and staging

Actual isolated nonroot PG17.11 synthetic tests cover section/technical/valuation,
metadata types/dataset semantics, factor fields/semantics, public locator, URL,
bounds, unknown-field/value canaries, independent raw URL policy versus first
failure, two projection boundaries, data/grants/RPC non-mutation and an unchanged
14-case baseline acceptance/rejection matrix. The baseline differential uses exact
public blob d8ba71232d4e5d92dab63b1a270c2ad05c7be4eb from e2af3017; reproducing that
history check requires its Git object (a full public checkout), not a live receipt.
All fixtures remain synthetic. No actual host/domain/query/URL is in the output.

Apply `t18-detail-json-diagnostic-stage-manifest.json`: only two runtime replacements,
51 blobs remain51. All original source/migration pins, source/asset roots, host
lock, stdin key custody and admission/invalid/real commands remain fixed. Onsite
execution belongs to the coordinator; Cloud has not retried the formal backup.
Use the new clone diagnostic to establish the actual first category. Keep the
parallel raw-policy observation separate and continue rejecting until a specific
consumer-backed change has its own independent source/data-boundary review.

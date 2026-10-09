# Financial supplement two-P2 repair proposal (not implemented)

Subject under review: abd58da2289222f2fef6777c0da50652aefe5f34; maker receipt
9c2243e1258b5f857f5a80a49b157d73bfea9b5f. Independent review reported an
unbounded awaited close after deadline and omitted Q3 monthly operand lineage.
Prior green tests remain historical and are insufficient for these boundaries.
This proposal awaits the complete reviewer probes and independent repair design
review; it is not permission to merge, dispatch or publish.

## Shared deadline and unconfirmed cleanup

The original single 10,000ms monotonic deadline includes pre/post original-lease
and source-seal checks, reads, compute, serialization, descriptor validation and
confirmed descriptor cleanup. Successful supplement return requires every opened
handle to be confirmed closed before that same deadline. No grace period extends
success eligibility. Timeouts do not claim cancellation of kernel I/O.

On read/validation failure, initiate cleanup without waiting beyond the shared
remaining deadline. Preserve the original primary failure. A failed or still
pending close is explicitly `cleanupComplete:false`, `recoveryRequired:true`; it
must not silently replace the primary failure, count as successful cleanup, or
allow a result to escape. The guarded endpoint may return only generic bounded
resource status, never file contents, credentials or raw private diagnostics.

Track pending opens, reads and close attempts for the process-owned financial
operation. A late-open descriptor is included and closed; late read success is
discarded. While cleanup is unconfirmed, new financial file admission fails
closed, preventing repeated timed-out requests from accumulating descriptors.
State clears only on confirmed cleanup or a process recovery; no durable budget,
preparation, seal, role or original deadline is renewed. Recovery is a limitation,
not a claim that the runtime can forcibly stop a kernel filesystem operation.
The concrete implementation and process-admission bound need reviewer agreement.

Required probes include read and close both pending; deadline already exhausted;
close rejection after original read error; late-open resolution; pending cleanup
rejects a subsequent financial admission; confirmed cleanup permits a later one;
all handles closed before successful return. Each probe has a bounded external
parent and records both primary error and cleanup attribution. A timer alone is
insufficient, and the existing 10s assertion is not weakened.

## Monthly Q3 operands and original availability

Project each of July/August/September as an attributed reported monthly fact,
with original period, printed unit, sign, URL, exact pinned file SHA and JSON
pointer, original publication precision/value and original source observed clock.
Extraction recordedAt is an availability floor; local Git read/acceptance is a
separate current clock. Do not replace source observation/admission by `now`.
The original raw PDF acquisition and the later extraction are separate clocks.

AUO operands are dataset monthly rows21/22/23, 20370/23102/23404 TWD million,
with original observedAt 2026-10-08T06:52:48Z, source publication unknown and each
existing independent rounding interval preserved. The derived sum is 66876 and
its interval is obtained from those three intervals; it is not exact Q3 reported
financial revenue and does not imply Q3 EPS or complete reconciliation.

EMC operands are financial relay monthlyRevenue.rows21/22/23,
19206698000/20145589000/21532230000 TWD. Source is the TWSE2383 profile,
raw observedAt 2026-10-08T09:27:58.821107+00:00, extraction recordedAt
2026-10-08T09:28:37.654569+00:00; produced date2026-10-08 is date-only,
without verified publication instant/zone. Sum/1e6 is60884.517 TWD million.
Do not invent a rounding precision for those rows. Retain all existing seven
monthly-versus-quarter discrepancies without forcing them to reconcile.

The Q3 derived bridge references the three operand locators, formula, conversion,
rounding/reconciliation limitation and original source clocks. It must not become
an issuer-reported Q3 income statement. The selected projection remains bounded
by64 total fact/derived rows,160000 projection bytes and262144 result bytes. A
closed explicit selection may omit nonessential reported detail, with omissions
listed; no truncate-success or silent loss of Other/group/owner/NCI/share basis.
Tests bind each operand/value/locator/clock, preserve source precision, prove the
sum and interval, reject missing/duplicate months, and keep local clocks separate.
No original inventory/model/source bytes or model cutoffs are changed.

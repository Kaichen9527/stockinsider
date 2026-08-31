# Exact implementation review — long-running internal API caller

Date: 2026-08-31

Review authority: read-only review of the complete immutable diff, the VPS
systemd call boundary, canonical-origin and bearer enforcement, timeout and
failure semantics, regression tests, and the unchanged product/runtime graph.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `ab7211c8c5325736f0065b7916aaa7d8121f52a0` / `ccbf5ff836e6b5a439a7fe85ebc132d1d14d82dc`
- Full final range: `74648b0fa75588b3dd2ae9f27877e229332b01be..ab7211c8c5325736f0065b7916aaa7d8121f52a0`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The repair replaces Node fetch's independent five-minute response-header
  deadline with the configured absolute internal-call deadline. This aligns the
  caller with the systemd research timeout while retaining an explicit finite
  upper bound.
- The request still requires an exact canonical origin and internal bearer key.
  The key is supplied only in the request header from the protected environment;
  it is not added to the unit command, response, journal metadata, or repository.
- HTTP and HTTPS are selected only from the validated application URL. The
  request body has an explicit byte length, response bytes are collected before
  JSON validation, and non-2xx or `ok !== true` responses keep the existing
  fail-closed terminal behavior.
- The deadline destroys the request and rejects deterministically. Both the
  success and error paths clear the timer, so a completed request does not retain
  a process-liveness handle.
- Regression tests cover a response delayed beyond a short interval but within
  the configured deadline, bearer/body preservation, and deterministic expiry at
  the configured absolute deadline.
- Candidate/shadow contracts, TypeScript, lint, the production build, and diff
  hygiene passed on the exact subject. The Opportunity V3 active graph is
  unchanged and all 31 PCR fulfillment rows remain bound to the reviewed tree.

## Closure

No P0, P1, or P2 code finding remains. The subject is ready for protected checks,
rebase merge, atomic VPS release, and a controlled retry of the candidate research
cycle.

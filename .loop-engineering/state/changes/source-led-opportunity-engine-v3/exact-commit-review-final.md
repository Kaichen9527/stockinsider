# Exact implementation review — orphaned production lease recovery

Date: 2026-08-31

Review authority: read-only review of the complete immutable diff, authenticated
API boundary, lease race safety, systemd caller contract, regression tests, and
the unchanged product/runtime graph.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `75ad80e8fdd6518a62aa4d54a4284ce0d6d25665` / `f92452c9debd4e4a324c7b9ccbf73f7bf6fcaaf3`
- Full final range: `ea1662641da418020b95ad1f30864d8d7bc57271..75ad80e8fdd6518a62aa4d54a4284ce0d6d25665`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- Recovery is reachable only after `requireInternalAuth` succeeds and only when
  the request explicitly opts into orphan recovery. Public requests cannot
  invoke the mutation.
- The standard 3,600-second research caller receives a 3,900-second lease,
  preserving five minutes for normal `finally` release after the response
  deadline. Other callers remain bounded to the database's 60-to-7,200-second
  lease contract.
- A recovery read must show a valid owner UUID and an acquisition at least 3,900
  seconds old. Newer leases fail closed with the existing 409 response.
- Release uses the existing owner-bound RPC. If another caller replaces the
  expired lease between read and release, the old owner cannot delete the new
  row; acquisition is retried only after the owner-bound release returns true.
- The VPS service retains the file lock and exact loopback origin while opting
  into guarded recovery. Source refresh and public endpoints do not gain the
  recovery capability.
- No direct table deletion, unauthenticated administrative endpoint, secret in
  a unit, or unconditional force unlock was added. The recovery path follows the
  existing service-role RPC boundary.
- Candidate/shadow contract tests, TypeScript, lint, production build, and diff
  hygiene passed on the exact subject. The protected product/runtime track is
  responsible for the complete 150-test graph verification.
- The Opportunity V3 active graph is unchanged and all 31 PCR fulfillment rows
  remain bound to the reviewed tree.

## Closure

No P0, P1, or P2 code finding remains. The subject is ready for protected checks,
rebase merge, atomic VPS release, and one owner-safe lease recovery.

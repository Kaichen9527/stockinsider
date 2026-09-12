# Exact implementation review — v3.17 inventory graph transition

Date: 2026-09-12

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `eafb6b606465b12e8261d2ec470ecc84d6ec5c17` / `3f97bf3a3bf887748f9aa2724ce9910977ee39ec`
- Full final range: `623a2dcf397297c806aeddd6dd4e5f60254e92c3..eafb6b606465b12e8261d2ec470ecc84d6ec5c17`
- Active graph: `dea5f4dee7aadf11435bd95f5f0d8024605e5f298f9a02645aa9352865099b7f`

## Review result

- Reviewed the full two-file transition. It does not alter the active product graph, source policy, valuation logic, deployment behavior or runtime authority.
- The transition accepts only the exact stale v3.16-derived JSON prose and digest that were merged with the v3.17 host-pin rotation. It independently requires the exact v3.17 Markdown sentence, the 2,142-byte canonical signed-host fixture and the exact v3.17 script-row digest; arbitrary mismatch still fails closed.
- The catalog byte hash assertion is corrected to the actual tracked v3.17 catalog blob. No catalog member, owner or contract version is changed.
- The protected worker registers one future active graph and immutable requirements and architecture evidence refs before the candidate graph can consume them. Candidate-controlled bytes cannot select alternate refs.
- The transition is explicitly temporary: the corrected candidate must update the canonical JSON values and remove both compatibility assertions. Leaving either stale or accepting any third value fails.
- Protected worker transition tests pass 15/15. The product acceptance run reaches the strict mirror boundary with the known v3.17 values reconciled; unrelated local symlink-only browser build behavior is not part of this source change and remains covered by GitHub's clean checkout.
- No unresolved P0, P1 or P2 finding remains.

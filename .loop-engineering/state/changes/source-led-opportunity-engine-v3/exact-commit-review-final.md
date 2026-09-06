# Exact commit review: VPS runtime wiring and source truth

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `e394c468fadc1686ce8bc56c617ecb5e2e1b9179..64c444520066ea378b6ebeffecdd935893942c04` and reviewed tree `9809759829524eec420a683a98ae1b0e42eb4572`.
- VPS schedule installation of the fixed runner principal, Supabase project reference, and approved service-role-key digest without persisting the service-role key outside the protected environment file.
- TWSE insider connector policy while the official API blocks the production VPS egress, including explicit manual-only terminal state and opt-in reactivation.
- Full connector-registry reconciliation before an active-source batch and preservation of isolated active connector execution.

## Findings

- No P0/P1/P2 findings remain. The installer validates the root-owned protected environment file before reading it, derives only non-secret tuple metadata, clears its temporary key variable, and writes no credential to Git or the unit file.
- The TWSE connector no longer turns an upstream WAF block into a failed all-source cycle. It remains explicitly unavailable until a production canary succeeds, while Telegram, PTT, and GDELT continue independently.
- `connector=all` refreshes registry disposition for active, blocked, manual, and retired sources before executing the active subset, so the source center cannot retain a stale active label.
- The changes do not weaken internal authentication, writer lease enforcement, valuation authority, lifecycle promotion, dossier evidence, publication ordering, or Shadow policy.

## Verification

- Protected product-correctness acceptance suite: 150/150 passed on this exact subject.
- Source policy and source ranking suite: 65/65 passed.
- TypeScript, ESLint (zero errors; pre-existing warnings only), Bash syntax, diff check, and production Next.js build: passed.
- Exact-diff review of secret handling, systemd reconstruction, source policy, registry reconciliation, and failure isolation: passed.

## Evidence

- Final reviewed repair/tree: `64c444520066ea378b6ebeffecdd935893942c04` / `9809759829524eec420a683a98ae1b0e42eb4572`
- Full final range: `e394c468fadc1686ce8bc56c617ecb5e2e1b9179..64c444520066ea378b6ebeffecdd935893942c04`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`

# Implementation and review plan

1. Add `host-recovery-install-plan.mjs`: frozen-source unsigned dry-run and pure
   validation interface. Keep existing packet verifier and active graph intact.
2. Add adversarial tests that reconstruct Git facts, generate ephemeral test
   keys, validate exact signed envelopes, reject missing/extraneous/untrusted
   input and verify CLI cannot execute or sign.
3. Document each external field, signing preimage, trust limitation, finite
   operation sequence, crash/expiry/TOCTOU obligations and absence of real adapters.
4. Run focused new and existing recovery tests, protected-worker regressions,
   web production build and whitespace checks. Record actual results.
5. Commit proposal source separately; hand exact commit/tree to another reviewer.
   No self-approval, automatic adoption, push to frozen PR #288 or installation.

External execution is blocked until authority, installed release, exact worker
and review registry manifests, permission receipt, durable ledger protocol,
atomic install/base-publication protocol, fresh host measurements and all signed
review/owner evidence exist. No implementation can infer those missing contracts.

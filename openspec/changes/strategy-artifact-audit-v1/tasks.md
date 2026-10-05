# Execution ledger

- [x] Pin the retained baseline and implement an independent bounded offline audit.
- [x] Preserve every strategy/scenario, exclusion, blocked hypothesis and limitation.
- [x] Implement private immutable report/receipt output and distinct audit/investment statuses.
- [x] Fourteen adversarial tests passed; actual retained audit checked all 24 files and 15 paths (740 derived checks, zero discrepancies). Exact hashes and all limits are recorded in `docs/operations/2026-10-05/strategy-artifact-audit.md`.
- [x] Address the two independent P2 findings: preflight descriptor capabilities before output creation, and pin every path ancestor plus the artifact directory during reads. Preserve all frozen expectations and original receipts.
- [x] Successor: 21 adversarial tests passed with `/usr/bin/python3`; real retained audit reproduced all 740 checks and the original report hash. Actual unsupported Python 3.9.1 returned exit 2 before output creation. Successor receipt is recorded separately in the operation document.
- [ ] Independent scope review and root integration.

No network/submission/holdout/replay/production change is included or authorized
by this ledger. Existing historical results and receipts remain unchanged.

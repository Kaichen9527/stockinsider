# T07 — Producer-to-SQL financial receipt parser clock

The exact TypeScript producer from `f8be9f28bcaf9f4e2d1e8257bad8d7d201b30a43` and SQL descriptor from `40fe8738cd5768b67269f7085e31014d2a84e0da` ran offline on Contabo with synthetic receipts. All 13 Node dependency files were verified against their Git blob IDs. PostgreSQL independently recomputed the fact and receipt hashes and matched all five receipts emitted by the pinned producer.

| Source case | Pinned TS and array-fixed SQL | Proposed resolver and array-fixed SQL |
| --- | --- | --- |
| TPEx OpenAPI | Accepted | Accepted |
| Official-domain document, parser recorded at the same instant | Accepted | Accepted |
| Official-domain document, parser recorded one microsecond later | TS emits a receipt with the earlier clock; SQL rejects it | Both accept with the parser clock |
| Official-domain document, parser recorded one microsecond after cutoff | TS emits a receipt; SQL rejects it | TS defers before the SQL descriptor |
| Approved issuer document, parser recorded one microsecond later | Accepted | Accepted |

The original projector and resolver load parser evidence only on the approved issuer branch. The recovered SQL descriptor uses the same required parser evidence identity and captured time for both official-domain documents and approved issuer documents. The proposed resolver reads existing parser evidence for every referenced document, requires the same link, receipt, hash and parser identity, and includes its recorded instant in the receipt. The explicit array append remains required for OpenAPI. The attached TypeScript diff was tested through the actual resolver body with a finite synthetic read adapter. It adds a bounded parser-evidence read for each group of selected document receipts, using the existing table and read limits.

The transport initially rendered a control byte in a dependency as printable characters; binary-safe Git blobs fixed the replay. An initial fixture also had an invalid synthetic locator. The published matrix is from the byte-verified, corrected fixture.

The diff is a source candidate for Cloud review. It changes receipt clocks where the exact parser record becomes available later. The normal writer/worker integration, legacy replay policy, actual source financial inputs, deployment ACLs, and full native tests remain open. No production service or database was modified and all temporary staging data was removed.

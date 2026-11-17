# PR #384 committed response recovery

Built the fixed integration source with Next.js 16.3.4 and used real isolated PostgreSQL 17.11. After alignment of a single fixture receipt column the production read path completed, an independent database observer witnessed one committed preparation, and the proxy closed the socket before sending any response bytes. The two explicit reads observed the same immutable preparation without reissuing the write or adding provider work.

Five subtests passed. The next subtest still receives the original provider-source guard's P0001 during journal reservation. No external model was called. The complete native suite and the release gate remain open.

[Machine-readable receipt](../../docs/operations/2026-11-16/vnext/pr-384-native-preparation-http-recovery.json)

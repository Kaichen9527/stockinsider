# Unsigned scoped watcher deadline repair review

Subject SHA256: a999310918978e63b408fdd765d87b3630a0ede90d920300cb0f4b575a7075f4.

Scoped repair CODE PASS. The original90-minute-overrun P2 is closed. Query timeout now uses the remaining monotonic budget; checks after query, before and after result writing reject late terminal success; sleep is clamped to remaining time. Original fixed query, readonly transaction and lock order remain unchanged.

Five independent pure mocked executions of the exact source passed: last-second query timeout, terminal returned exactly at deadline, remaining sleep clamping, result write crossing deadline, and terminal observed before deadline. The original5399-second case now requests only1second and exits2 at5400, with no extra30second sleep. Late terminal data is not reported as successful completion. Real-time process teardown/scheduling/filesystem latency are not proven to be hard real-time by these mocks.

Original RED and prior review remain separate and unchanged. New raw probe/receipt: /tmp/stockinsider-main169-refresh-watch-review-a999.json, SHA256 07d4e9cf42c44423b4f1e436d7d19b97226db6092cba48a9d4a929bf269f2c92.

The parent specifies launcher creation of a unique nonexisting root-owned0700 /run output directory. This launch prerequisite was not executed or independently observed. No production connection, SQL execution, real lock, timer change, pipeline retry or source edit occurred. This review does not attest publication or protected approval.

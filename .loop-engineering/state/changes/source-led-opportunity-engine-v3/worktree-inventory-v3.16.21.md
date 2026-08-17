# Legacy worktree preservation inventory — 2026-08-17

Canonical repository: `/Users/kaerchen/Desktop/20_stock/StockInsider/repo`.
Legacy registry: `/private/tmp/stockinsider-git-repair.InBvtz/mirror.git`.

The legacy registry contains 85 worktrees: 59 clean and 26 dirty. Twenty clean
heads are reachable from its recorded `origin/main`; 39 clean heads are not proven
remote-reachable. No legacy worktree was removed. Cleanup is deliberately outside
the V3.16.21 release critical path and may remove only clean, remote-reachable
entries after a separate checkpoint.

The following dirty/unborn entries are preservation targets. Counts are porcelain
rows, not file sizes:

| Worktree | HEAD | Dirty rows |
|---|---:|---:|
| `/private/tmp/stockinsider-v315-activation-repair.SmThbf` | unborn | 819 |
| `/private/tmp/stockinsider-v315-analysis-payload-dedup-repair` | unborn | 819 |
| `/private/tmp/stockinsider-v315-chunk-apply-repair.verified` | unborn | 819 |
| `/private/tmp/stockinsider-v315-finalexact.1Xer87` | `1655d44f17dcfc1e6f45deb8c0d9691a79c2eff7` | 3 |
| `/private/tmp/stockinsider-v315-persistence-repair.v7cP0L` | unborn | 815 |
| `/private/tmp/stockinsider-v315-production-source-1ade` | `1ade82f7b3cd6a2faaa855af9ba04b3a9f741f89` | 1 |
| `/private/tmp/stockinsider-v315-production.LCnKko` | `36f06640e68fda287beaeffd4a35eccb2700fb47` | 1 |
| `/private/tmp/stockinsider-v315-timeout-exact.aizm4s` | `3de7c14b09b27c559cad09bcf9507f0315df8059` | 3 |
| `/private/tmp/stockinsider-v315-timeout-repair.IywLQQ` | unborn | 818 |
| `/private/tmp/stockinsider-v316-evidence-repair` | unborn | 822 |
| `/private/tmp/stockinsider-v316-rebased-final` | unborn | 819 |
| `/private/tmp/stockinsider-v316-rebased-final-v2` | unborn | 822 |
| `/private/tmp/stockinsider-v31610-rebased.9LQPZo` | unborn | 843 |
| `/private/tmp/stockinsider-v31611-evidence.hAdYEf` | unborn | 845 |
| `/private/tmp/stockinsider-v31611-owner-evidence.5GhGvc` | unborn | 845 |
| `/private/tmp/stockinsider-v31611-resolver-evidence.0MbvLZ` | unborn | 845 |
| `/private/tmp/stockinsider-v31612.7XIQt4` | `bcc1b9ed8e0e7f0995073315b40c9fd17fd7c7a1` | 3 |
| `/private/tmp/stockinsider-v31614-projection-repair.QDnsdA` | `047814894684123193f713b3a43554758271bc12` | 3 |
| `/private/tmp/stockinsider-v31615-analysis-reuse.paxTSE` | `c65013f062941d86548db3df62e9d37f62c2d866` | 3 |
| `/private/tmp/stockinsider-v3162-canonical.XGFJkD/release` | `d2aa2c498f5363414d31cb794b94a2e222dbff69` | 2 |
| `/private/tmp/stockinsider-v3163-retry-repair.0x95SX/release` | unborn | 825 |
| `/private/tmp/stockinsider-v3167-repair.alvlCN/release` | unborn | 825 |
| `/private/tmp/stockinsider-v3168-repair.227OgY/release` | `6c986eca0da0904b9af173e13359a457cfee0060` | 3 |
| `/private/tmp/stockinsider-v3169-evidence.SQJn9F/repo` | unborn | 836 |
| `/private/tmp/stockinsider-v3169-transaction-time.8oySlO/repo` | unborn | 843 |
| `/private/tmp/v316-evidence-final2.MlvmlL` | unborn | 822 |

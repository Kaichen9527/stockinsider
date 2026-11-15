# Staging close-control observer work in progress recovered

Recovered three source files from the staging Codex Cloud chat `01a1b8f7-daf0-7636-984c-0d081117f093`, terminal turn `01a1dd1c-9aa6-74ef-849e-635ddf0edfc0`. The turn stopped at the Cloud usage limit before a Git push. Its entry worktree reported `44c059f62f5733054e0044489b8c7b050973717d`. This local commit was unavailable via the GitHub commit API. The recovery is based on published observer commit `f23854f2fa28b9104dba3f115f32891c2ccabffd` and does not recreate the missing worktree commit.

For the existing five-source collector, the published base matches the exact Cloud-recorded SHA-256 `2d2d6e9652d3cc567d032bef8e8ef242d8b1186b8e89d305d4ceca16f2c89657`. Applied all 12 complete add/update records in turn order with context matching. Reproduced the final Cloud re-pin to the restored helper bytes. The helper SHA-256 is `0684b92ce7a5e9f493bd923ce99a70f47c16a42a325c93e73b93e83dc1f2b07b`.

The Cloud turn recorded 11 passing synthetic Python tests before the final edits, and the attempted web build exited 127. Recovered final bytes are pending the full test rerun and independent review. No observer was installed from this recovery. At the time of recovery, the six previously installed staging timers were still scheduled for November 16–17 at 21:26, 21:27 and 21:28 Asia/Taipei.

The recovery preserves source only, including the close-control helper, its caller and tests. The original VM and all other unavailable edits remain pending independent recovery.

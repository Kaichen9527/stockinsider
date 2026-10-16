# Guarded staging alternatives: NONE / NOT_READY

Read-only OS/source audit on 2026-10-16, base `a511bcdd1ba6803b62a23f215fd4b8c662888f94`; executed source remains `1b44d34594bd3dd4bfa6d4e5655e8d7f60959ce7`. All 334 source inputs / 10,516,436 bytes were independently rehashed and Git-blob checked unchanged. No PG, Node, syntax, app, native or build was executed. No staging directory/file was created, no chmod/mount/environment override, cleanup, signal, cache operation or source fix occurred. Only this audit's reports and Git delivery were written. No environment configuration was changed.

At 11:10:31.453375Z, actual execution-context metadata gives the following. These are read-only mode/access/statvfs observations, not a write probe or native admission.

| Candidate parent | Full ancestor guard | Actor writable | Device | Available bytes | Result |
| --- | --- | --- | --- | --- | --- |
| /home/agent | yes; / 0755, /home 0755, leaf0700 | yes | 27 | 8,590,663,680 | insufficient known working-set reserve |
| /workspace | yes; / 0755, leaf0755 | yes | 27 | 8,590,663,680 | insufficient known working-set reserve |
| /tmp | no; leaf1777 contains022 | yes | 34 | 13,609,857,024 | original guard rejects |
| /run | yes | no | 27 | 8,590,663,680 | not actor-writable and reserve insufficient |
| /mnt | yes | no | 27 | 8,590,663,680 | not actor-writable and reserve insufficient |
| /dev/shm | no; /dev0755, leaf1777 | yes | 26 | 17,871,892,480 | original guard rejects |

Existing non-sensitive directory mounts were screened without inspecting their contents. The actual /dev mount is only 64MiB and not actor-writable; it cannot satisfy an 8GiB reserve. No additional qualifying directory mount was found. Pseudo/sensitive mounts were excluded. A 0700 child under /tmp or /dev/shm does not fix its disallowed ancestor.

The tool sandbox presents different mount metadata: its /dev/shm appears0755/device37, while the actual native execution context shows1777/device26. Sandbox metadata is explicitly retained separately and cannot be used to approve actual native staging. No fake lstat or permission exception is proposed.

Home/device27 currently has only729,088 bytes above the fixed8GiB floor. The29 fixed files alone require1,790,390 bytes: **at least1,061,302 additional free bytes** would be needed just to retain the floor after their raw size. Using the prior1,916,928-byte observed allocation reference gives1,187,840 bytes additional. Neither number is a sufficient upper bound: directory/block overhead, Git/index/platform concurrent writes and runtime allocations remain uncertain. Tmpfs PG/WAL/log/snapshot/RAM consumption remains additional. No cause is assigned to changes in free space. This report does not certify READY or authorize another run.

## Limited generated-output inventory

Only known paths in primary `/workspace/stockinsider` were considered; the traversal visited939 entries, below20,000. The generated-output traversal did not enter source/history/model/docs/Gitobjects/raw/WIP/RED/cache/node_modules/.env/other-App paths; the separate required334-source identity/reference check is reported below. The two existing targets have complete non-symlink ancestor metadata, actor ownership, no Git-tracked files, no symlinks and no regular file with nlink other than1.

| Candidate for further review only | Entries / regular files | Regular bytes | Allocated bytes |
| --- | --- | --- | --- |
| web/.next/server | 621 /465 | 8,220,191 | 10,231,808 |
| web/.next/static | 318 /156 | 1,382,663 | 2,564,096 |

The remaining requested standalone/dist/build/coverage paths are absent. All621 regular files were hashed (9,602,854 bytes); only aggregate/hash-inventory references are published. BUILD_ID/build-manifest/package identities were recorded without printing their contents. **12,795,904 allocated bytes is observed occupancy, not reclaimable space.** Exact package/same-byte retained-copy parity and exact rebuildability were not established. Neither an untracked path nor a build recipe proves an output is nonunique or disposable.

The334 sealed source inputs contain no literal reference to these three .next output paths, which is a bounded literal search only. Same-uid process cwd/FD examination found no target match, but only28 FD targets were readable and3,209 inaccessible/racing entries occurred across1,608 processes; this is not proof of no live references. No process command line/environment was read. **Safe deletion candidates: empty.** Both existing output directories remain UNKNOWN for rebuildable/nonunique/unreferenced status. They may be examined further by Root, but this audit authorizes no deletion or claimed recovery amount.

The broader below5GB session inventory trigger did not fire. This was the expressly authorized narrow project-generated-output audit, not a broad cleanup scan. Old PIDs705734/702395/702424 remain PID1 stateZ/RSS0; no signal was sent and none is called absent.

All prior resource-hold, 0PASS2FAIL and source-only8PASS evidence stays attached to its original subject. No native result was produced by this audit. Private metadata/hash lists remain local, published evidence is maker-derived and not independent/native/formal approval. Full goal remains ACTIVE; no VPS, formal data lane, DD one-shot or terminal PR helper was touched. Stop for Root review; no next source fix or native execution is started.

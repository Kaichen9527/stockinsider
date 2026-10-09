# Offline Podcast pilot — executor component handoff

Design source da17f311b964f9d035b249ff4066776db4d6c597 received root-relayed unsigned bounded DESIGN PASS. This first code increment owns only scripts/podcast-offline-pilot.py, scripts/podcast-offline-pilot.test.py and this handoff. No package/shared runtime/workflow/production change. Actual source acquisition, wheel installation and ASR are NOT IMPLEMENTED in this first freeze; ordinary --run-isolated refuses before root creation. A separate successor will implement them under the same approved design, after preserving this review subject. There is no content-capability result.

Implemented components: network-free default preflight, explicit child environment allowlist with synthetic credential/config canaries, fixed binary-only public-index resolver/download and no-index/hashlocked local installer argument plans, finite wheel report hash-lock validation, exact public-source pure policy, pinned model byte/Git-blob identity checks, private filesystem inventory, and Linux pidfd/subreaper process supervision. These component helpers do not prove a complete installed dependency closure or public transport correctness. In particular, fixed pip argument checks are not an actual pip/global-config behavior test.

Supervision uses Linux process start identities and pidfds. Every stage has a new session/group; TERM then KILL are sent to exact owned member pidfds, not potentially reused numeric PGIDs. A subreaper discovers adopted descendants after leader exit, including changed groups. Success requires no owned process remaining. Unconfirmed launch/cleanup preserves the root, blocks another stage and never marks content success. Sampling covers file logical bytes, dev/ino allocated blocks, free reserve, supervisor plus owned process RSS and scan time. Recorded maxima are sampled values, not true peaks. Local filesystem/proc I/O is cooperative; an unbounded kernel stall is not proven interruptible. Actual Linux capability and the three real process cases below are NOT RUN on Mac.

Actual Mac Python3.12 stdlib command (no downloads/install/model):

```
/Users/kaerchen/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12 -I scripts/podcast-offline-pilot.test.py
```

18/18 passed. Process supervision tests here use explicit deterministic fake process identities/clocks; real local tests cover private files/permissions, CLI refusal/preflight and a real FD-close check around a mocked pidfd race. They are not Linux tree-cleanup evidence. RED sampling failure13pass/1fail: /tmp/podcast-offline-pilot-supervisor-red.log SHA25603340f3bad10a2768be01c09e525579a613aac0dd295bcab85b28b99c2bd15a3. The correction counts the prior scan duration in the next ≤1-second interval. RED pidfd race retained in /tmp/podcast-offline-pilot-pidfd-red.log SHA256 d3f9f15ebce307082c9fe7b55c2d19651d9134f5f99158b2b4d3deebd3dde960; a mismatching identity now closes the unowned descriptor before refusal. GREEN /tmp/podcast-offline-pilot-supervisor-green.log SHA2568b8e43a1c4c9375d3201e647ee260c533d7e24959eda870ea73e2ce3faaaa7ba. Preflight /tmp/podcast-offline-pilot-preflight.json SHA256250140a061e73d86b8a24c9e04a360265c6a061978c49d2541caa67f10e12c21. Preflight reports actual current Python version/API presence; it does not probe network or claim Linux capability.

After independent exact code review, use the existing single VM queue for Linux/Python3.12 real synthetic acceptance:

```
python3.12 -I scripts/podcast-offline-pilot.py --run-isolated --supervisor-fixtures --artifact-root /NEW/ABSOLUTE/PRIVATE/ROOT
```

This mode only runs a stalled child, an oversized synthetic writer and a leader-exit/live-descendant child; no network, audio, package or ASR. The fresh0700 root contains0600 logs/receipt and is not deleted. The actual8GiB free reserve remains enforced; per-fixture small time/byte thresholds exercise refusal without heavy payload. The expected failure and confirmed cleanup are named separately; contentCapabilitySuccess stays false even when supervisorSubsetPassed is true. A missing capability, wrong failure or unresolved child fails the receipt and must stop the heavy queue until handled. No actual VM acceptance or full build is claimed here.

## Independent 6a supervisor repairs

The reviewer accepted the original18 local cases as local evidence but reproduced two P2s: a child newly adopted in the snapshot taken while acquiring a leader pidfd was discarded, permitting an empty-owned/success result after leader reaping; and an initial resource scan could consume the remaining deadline before an unconditional launch. Both are preserved in RED /tmp/podcast-offline-supervisor-review-red.log, SHA256958a3ce87e1ee490be25dc92c7f58bd2f5dd9b8467b241659348cf3432a3c3a8 (18pass/2fail).

The narrow repair now reconciles the entire post-acquisition/post-reap snapshot and acquires newly discovered identities through at most8 reconciliation rounds. A continuously changing tree refuses as process_tree_unstable with known ownership retained. It never interprets an uncertain tree as empty. The pre-launch path rechecks parent RSS and deadline after resource scanning and checks the deadline again immediately before Popen after log creation. No stage is launched on the controlled expired-start case.

Repaired local stdlib suite21/21 passes, zero skips: /tmp/podcast-offline-supervisor-review-green.log, SHA256 a12c9e7201f4e9453aa13e12c9c7eb272706c3657b4426bdb00dc20416473c46. The three added cases use deterministic snapshots/clocks, not Linux operational proof. Full transport/installation/ASR work is preserved separately as an uncommitted successor draft and is not included in this repair subject. Actual Linux fixtures remain NOT RUN and require independent repair review before VM scheduling. No audio, network, provider, package install or model execution occurred on Mac.

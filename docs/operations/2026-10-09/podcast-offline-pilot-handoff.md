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

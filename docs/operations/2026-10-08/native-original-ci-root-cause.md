# Original protected runner CI — verified failure boundary

Read-only audit on2026-10-08 of [run35888990201, job107278733261](https://github.com/Kaichen9527/stockinsider/actions/runs/35888990201/job/107278733261),
subjectd24977824a0ff00beef6a26b53e6c8078144841b,
treee205dc2ea9ec28a2d6aa40a18693f4196ea7f767.
The private fetched43063-byte job log has SHA256
2deae04323dd66cea6e11e1a9978288f72f19ec3c26444a8b64c3baf84e8cbc9.
The full log is not copied into this repository; bounded public failure facts
are recorded here without runtime values or secret-derived hashes.

## Direct observations

The original19 tests had17pass/2fail/0skip. JSONL test9 passed. The two failed
tests were12(host pin fixture has an exact hash-bound format) and16(disabled
doctor accepts the protectedv3.9 compatibility selector for exactv3.17fixture).
The earlier pasted excerpt attached the JSONL title to the doctor's line494/511
failure. Later-discovered parser defects are independently real but cannot be
attributed as the cause of this original run.

Test12 stack reaches [hostPreflight.js:75](https://github.com/Kaichen9527/stockinsider/blob/d24977824a0ff00beef6a26b53e6c8078144841b/scripts/model-runner-v3/hostPreflight.js#L75):
some executable's device or inode (at least one) differed from its exact pin.
That iteration already passed realpath/regular-file checks and had not reached
its later size/owner/mode/hash/version/signature checks. This is an observed
stat-identity mismatch, not proof of malicious replacement or specific content
change. The shared [loop at232–235](https://github.com/Kaichen9527/stockinsider/blob/d24977824a0ff00beef6a26b53e6c8078144841b/scripts/model-runner-v3/hostPreflight.js#L232)
checksCodex/Git/Node; identical stacks do not identify which iteration failed.
The log contains neither component name nor actual stat, so attribution toCodex,
or exclusivelyinode rather thandevice, is not proved.

Test16 proves doctor exit1. Its [assertion at509–511](https://github.com/Kaichen9527/stockinsider/blob/d24977824a0ff00beef6a26b53e6c8078144841b/scripts/model-runner-v3/model-runner-v3.test.js#L509)
retained onlystderr; [doctor126–134](https://github.com/Kaichen9527/stockinsider/blob/d24977824a0ff00beef6a26b53e6c8078144841b/scripts/opportunity-v3/doctor.mjs#L126)
writes detailed checks tostdout, which the failing assertion did not preserve.
The same host mismatch is a plausible inference, not a directly identified
doctor check. The version explicitly supportsv3.9compatibility forv3.17; the
pre-LF fixture digest was independently recomputed and matches the doctor.
Unsupported selector alone is not supported as the explanation.

## Consequences

Current inactive parser1afdd69 and lifecycle0825db4 have their own scoped
regression/independent review evidence. They do not establish an original-CI fix,
new-host trust, protected approval or permission to activate new pins. Actual
current executable/source/fixture identities and genuine external review remain
necessary. No pin, registry, signing authority or host was changed in this audit.

A future separately reviewed diagnostic increment may retain only closed enums
for component/phase/device-or-inode and whitelisted check statuses, bound to
subject/fixture/worker invocation. It must not dump complete doctorstdout:
that output includes runtime environment's secret-derived hashes. Diagnostics
never become authority or a reason to relax an identity check. The original
protected refusal was enforcement of the pinned-host boundary, not a test that
should be skipped to obtain a green result.

Root acquired the actual GitHub log; another agent independently verified the
hash, exact source and failure boundaries. This is unsigned read-only evidence,
not a protected review or live-host/provider reproduction.

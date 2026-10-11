# Bounded private Cloud input

The existing Cloud work CLI reads task/input/result files before its capacity/deadline checks. Its `open(filename,'r')` can block on a FIFO before verifying the descriptor is a regular file. This can leave a bounded Cloud job waiting indefinitely without model execution. This is the same class of actual independently reproduced issue as the separate insider CLI; the Cloud file is unchanged between7baa and converged4868472.

Root owns only `scripts/research-cloud-work.mjs`, its CLI test and this spec. No role dispatch, leases, source acquisition, publication, strategy, schema or Cloud controller changes. VM owns first-publication/calculator; coordinate before integration.

## Contract

- Keep existing absolute-file requirement and4,000,000byte maximum. Open the final component with O_RDONLY|O_NONBLOCK|O_NOFOLLOW before fstat. Reject nonregular files without reading/waiting for a writer; no symlink following.
- Read at most maximum+1actualbytes, preserving exact original size, then verify regular descriptor, size, dev/inode and ctime/mtime unchanged. A growth/short-read/same-size replacement race fails. Never allocate from untrusted unbounded size or readFile to EOF.
- Decode strict UTF8 before JSON.parse. Reject malformed UTF8 instead of silently replacing source bytes. Always close the owned descriptor on success/failure. Existing valid packets/receipts remain byte-equivalent; no truth/role/authority assertion is relaxed.
- A small exported reader seam may accept an injected open function solely for deterministic descriptor-race testing; production CLI uses the native opener. No new service API or general file framework.

## Acceptance

Controlled separatechild FIFO reproduces the old timeout then rejects promptly after the fix; close and stop only that test process with a positive owned PID. Actual regularfile/max/+1/symlink/directory/device/UTF8 and injectedgrowth/same-size-clockchange/shortread tests. Bound parent test time/output; no production/provider calls. Existing prepare/verify/write-once CLI regression must pass. Type/lint/normalbuild on VM and independent exact review before integration. Tests do not authorize a model adapter or pretend author/reviewer execution.

## Implementation checkpoint

Unsigned requirements/design approval covers specSHA256cc8977e4f6126f157a426071e4070310b1f81d32c5d80262cc84d14760cbe7b3. Root reproduced the unchanged old CLI with an actual FIFO in a separate bounded child:1secondETIMEDOUT, regular-file rejection assertion failed. Original redlog retained privately.

Implemented only the owned reader/test/spec. Final5/5CLIcases pass0skip onNode22.14, including originalprepare/verify/write-once, realFIFO/regular/symlink/directory/device/exact4MB/+1/invalidUTF8 and injectedgrowth/shortread/clockchange/pathreplacement withclose. The reader checks both the original descriptor and lstat of the path after the bounded read; it does not infer pathname identity from an unchanged fd alone. These checks reject observed changes during reading, not hypothetical mutations after returning the copied verified bytes. Supported execution-source generator --check passes unchanged; no modelrole/lease or productionSQL changed.

Existing test:research-agents explicitly includes this CLI suite. Independent exact-code review and VMtype/lint/normalbuild remain pending; no role/model execution, paidAPI, mainmerge or publication performed.

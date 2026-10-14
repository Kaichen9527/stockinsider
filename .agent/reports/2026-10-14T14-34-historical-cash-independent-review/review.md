# Independent bounded code review — REQUEST_CHANGES

Subject: `e2dcb6c20b71561dfb37d7728809b0be257d8fe2`
Tree: `8d5ed4a38fa861969ad052297018d67333b0c941`
Base: `b7796da8a92b99284b133a7a622e490a23bad11b`
Scope: all seven changed candidate files, the complete9b8247a7→e2d delta, and unchanged cash-core dependency. This reviewer did not implement these seven candidate files. This is an unsigned model-agent code review, not a human/third-party signature, formal Astra role/budget execution, protected approval, or review of this agent's SQL-tail implementation.

## Finding R2 — P2: bounded Map admission still materializes an unbounded property list

`web/src/lib/research-historical-cash-projection.ts:41` calls `Reflect.ownKeys(files)` before rejecting additional own properties. The new intrinsic size check correctly limits **Map entries**, but does not bound **own properties on the Map object**.

Actual independent reproduction, both companies:

- Native Map has the exact allowed9 AUO /7 EMC entries. A positive control uses the real pinned file bytes.
- Add10000 nonenumerable own properties with `Object.defineProperty`.
- Call the original projector. An observation wrapper calls the original `Reflect.ownKeys` unchanged, counts its returned list, and returns that same list.
- Both calls materialize10000 keys with one deadline check, then reject. Input property count can grow independently of9/7 entry limits, per-file bytes and aggregate bytes.

`probe.stdout` preserves the valid-pinned-input observations. `own-properties-red.stdout` preserves two failing bounded-work regression cases (0PASS/2FAIL/0SKIP, exit1); the latter deliberately uses minimal entries because rejection occurs before any bytes are inspected. Neither test changes production code. This is a current workload-bound gap in the injected-Map contract. It is not a claim of a remote attack or production integration.

The correction needs a bounded validation boundary for unused object metadata: avoid eagerly collecting an arbitrary own-key population, or establish an explicit trusted fixed-shape container boundary before entering the bounded projector. Merely moving this enumeration after the entry count preserves this counterexample. Any change to the strict no-own-properties contract should be explicit and reviewed; this review does not authorize weakening expectations.

P0=0, P1=0, P2=1. No scoped CODE PASS is issued.

## Prior finding and successful evidence

The original wrong-cardinality R1 is closed on the exact subject. Independent10000/0/1/extra-entry probes for both issuers rejected with zero iterator openings and zero iterator advances. The old peer report and maker RED are historical evidence; this review does not relabel them.

The original projection suite ran12/12, zero fail/skip/todo. Strict module-only TypeScript5.9.3, ES2017, NodeNext, `strict`, `allowImportingTsExtensions`, `skipLibCheck`, Node types passed. No core14/old115cleanup/PG54/fullbuild suite was rerun.

All15 unique fixture files were decoded under the2MB bound and compared byte-for-byte with Git15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb:931660 raw bytes. Gzip202500 bytes/SHAafedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f; expanded1245186 bytes. Per-company9/697558 and7/264753 inventories, fixed ordering, per-file length/SHA, canonical model hashes, complete top/nested manifests and packet membership agree. No PDF was read. Credential-named field scan found0; this is a finite field-name scan, not a general secret certification.

Independent projection checks reconciled52×2 AUO and33×2 EMC values/labels/pages/source-line hashes and exact JSON pointers; output lengths52077/32598 stay below160000. Outputs omit raw source lines and absolute local paths. The shared packet's other issuer facts are not projected. Both period bridges were independently checked with integer arithmetic for CFO/PPE/intangible proxy, total cash movement/closing cash and group-profit denominator. AUO paid-capital/share/equity arithmetic and null October-share/PB/target fields remain explicit. Existing core blob is unchanged.

Owned-byte isolation was observed by mutating caller buffers after all copies: results remained identical. Captured9/7 owned arrays were zero after success and after the final deadline exception; original caller buffers were not wiped by the projector. Source/availability clocks and all false authority/financial/publication/strategy flags were checked. Supplied byte identity is not filesystem custody, source publication verification, raw PDF verification or formal financial authority.

Both workflow diffs preserve existing jobs, permissions and execution scope. Cash diagnostics remain `pull_request`, `contents:read`, pinned checkout/setup-node, no persisted checkout credentials, Node22.14.0, five-minute single job; the new projection test is included. Product workflow changes are three path entries only; its existing runtime/model/manual workflow behavior is unchanged. No protected gate/trust/SQL/roles/pins change is introduced by this delta.

## Limits and preserved environment outcomes

Single-owner9/7 filesystem reading, regularFD/O_NOFOLLOW custody, cleanup and native10-second wall enforcement, full scenario-plus-cash schema/mapping, oldv2 replay, shared quota/fences, HTTP-PG and author/reviewer/publication integration remain pending. This candidate is a necessary leaf, not the completev3 scheme or a replacement publication route.

Initial sandbox Node test output exposed only a file-level aggregate, so it is preserved as such and is not counted as12 cases. The same command in the supported escalated environment produced actual12-case TAP. Initial read-only Git child spawn returnedEPERM; its original stderr is retained privately with exact hash because Node's error renderer included a source-byte prefix. The exported sanitized diagnostic records cause/path/hash. `/usr/bin/time` was absent (exit127); no package was installed. The independent semantic Node process reported maxRSS79300KiB. A whole-task peak meter was not installed or claimed. Disk measurements stayed above8GiB. No services were started.

Raw probes use the reviewer's exact local checkout path `/tmp/si-pubtail-o14`. Reproduction elsewhere requires changing only that runner import path to the exact subject checkout; no production source change is needed. Source manifests and raw hashes identify the executed input. No source files were edited, no live calls or production/model operations occurred, and no review refs or signatures were created.

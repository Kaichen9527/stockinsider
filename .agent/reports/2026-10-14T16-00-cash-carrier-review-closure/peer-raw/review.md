# Historical cash carrier — independent code closure review

**Scoped CODE PASS: P0=0 / P1=0 / P2=0 found.** R1 and R2 are closed for exact **06ae6924a7d6a90d60d3161a154fdb5104aab3f1**, tree **0e177f9c7c6a9ae209647d9ce66ff838f5ff7eb8**. This is an unsigned model-agent code review of this private candidate leaf, not independent human/third-party signature, formal Astra research role execution, protected approval, source verification, production acceptance, or complete v3 approval.

The reviewer did not implement the reviewed cash code. Root is maker. Earlier design recommendation a4c95096 is not used as code proof. Prior e2d REQUEST_CHANGES, fbf454d4 report SHA2223f72c1654a49f8762a3e0e178bd4aaf2868d310389a8d2fc9614d4993c23f, maker525a first cleanup RED and first TS2688 remain historical; none are relabeled. This review ran the current code and retained actual outputs.

## Exact scope and source comparison

Read the full projection, pins, projection tests, handoff and both workflows; decoded and hash-checked the private gzip without printing its raw contents. Reviewed e2d→06ae four-file delta and full b7796da8a92b99284b133a7a622e490a23bad11b→06ae seven-file stack. Full-stack file bytes/SHA/Git blobs are in static-compare.json. The core, operand vectors, gzip, workflows and root/web package+lock bytes are unchanged from e2d. A semantic comparison of pin objects proves that removing ONLY the new carrier cap and two carrier pins gives exact prior pins. Per-file524288/rawaggregate1048576/output160000 and existing numeric inventory remain identical.

Ordinary arithmetic workflow retains pinned checkout/setup-node, contents:read, no persisted checkout credentials, Node22.14 and five-minute job. Only relevant paths and the existing serial Node invocation gain projection tests. Existing source-led workflow changes only three path entries; its inherited jobs/actions/permissions/commands are unchanged. No protected workflow, expectations, SQL, authority, legacy reader or API is modified by this stack.

## Why the previous defects close

At projection.ts:20–37, ArrayBuffer.isView and captured native typed-array kind/backing/length accessors reject all Maps/proxies/wrong kinds. Ordinary fixed ArrayBuffer is required; SharedArrayBuffer, resizable and detached backing reject. There is no caller Map iteration or own-key reflection. Caller Uint8Array/Buffer metadata is explicitly outside the serialized byte domain, never read or enumerated; all former Map input is deliberately unsupported. This is a breaking unpublished internal interface, not a compatible normalizer. No arbitrary Map encoder is exported.

At lines55–62, static exact length is checked before owned allocation, then only the owned copy is hashed. UTF8 decode and JSON.parse occur after its fixed whole SHA. Thus unknown/duplicate serialized keys, alternate ordering/spacing/base64 and issuer substitution cannot be normalized away. The hash is over bytes that will actually be parsed, avoiding a hash-caller-then-copy race. At lines67–77 each sole base64 buffer is immediately registered, checked for original raw length/hash and aggregate bound. Original complete model/manifest/packet/locators/semantics and fixed calculator remain active. Finally line145 wipes owned raw and carrier buffers; caller memory remains owned by caller.

No new concrete P0/P1/P2 counterexample was found within this contract. Trusted module-realm intrinsics and cooperative trusted deadline callback remain assumptions; this is not a sandbox against arbitrary same-process monkeypatching.

## Actual executions on Node v22.14.0

1. Exact repository command: `node --experimental-strip-types --test --test-concurrency=1 scripts/research-historical-cash-core.test.mjs scripts/research-historical-cash-projection.test.mjs`. **29/29 PASS =14 core +15 projection; 0fail/skip/todo**, exit0. Raw suite.tap and suite.stderr retained. This is current execution, not old12-case attribution.
2. Strict module-only **TypeScript5.9.3 PASS**, exit0, targetES2017, nodenext resolution, noEmit, allowImportingTsExtensions, skipLibCheck, explicit `--types node --typeRoots ./web/node_modules/@types`, exact three cash modules. No app-wide types/lint/build claim.
3. Independent probe.mjs: **38 named boundary probes PASS**, separate and overlapping repository tests; do not add to29 as unique coverage. Eight old-Map cases cover real valid bytes, valid plus10000 own-property getters,10000 entries and empty for both issuers; iterator/getter/ownKeys touches all0. Ten pre-decode/pre-parse rejections include same-length byte drift, same-length reordered files and same-length unknown-key substitution; JSON.parse/TextDecoder spy counters remain0. Native Buffer/Uint8Array/offset views with hostile getters produce golden outputs with0reads. Shared/resizable/detached/DataView/clamped/proxy reject; proxy traps0. Caller mutation at the post-copy deadline checkpoint cannot alter either projection.
4. Independent cleanup instrument imports exact runtime separately, records actual carrier/decode allocations and explicitly excludes module-loader phase (observed0 loader allocations here). Success and **80 AUO /57 EMC** injected deadline failure points verified **683/379** owned buffers zeroed, respectively. An additional hash-failure carrier per company is zeroed. Oversize rejected with no copied buffer; caller hashes unchanged. These are cooperative exception-path probes, not a timer or FD cleanup test.
5. Recomputed both carriers from the actual fixture, and **all15 unique source files** were freshly compared byte-for-byte with local `git show 15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb:path`, with pin length/SHA verified. Not merely inherited prior equality. Gzip202500/SHAafedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f; bounded expansion1245186. Source bytes are not exported in probe output.

| Symbol | Files/raw bytes | Carrier bytes/SHA256 | Output bytes/projection SHA256 |
|---|---|---|---|
|2409|9 /697558|931023 /823b80038e13779f4155327b3cd7d36b1dc5a833490da1bf692d33845c239590|52077 /b59bd42321ac7e9af6c3fcd1eba86fa359f2537d467a45e8fbef244e442c434d|
|2383|7 /264753|353803 /5fff5dd7e33ae7da30d8b72890f13414866b7820f54685af38b5cdd95d2b5564|32598 /a1965a0f56556c4c4b50f89f7f96ef263b6fd7b6aec529c919cce3b8bfa585d7|

The original output hashes, all false authority/admission flags, null future cash and no raw sourceLine/absolute retained-PDF path exposure are retained. Carrier1MiB, decoded aggregate1MiB and raw file512KiB are distinct bounds; base64 size is not raw-file size and neither is total RSS.

## Limits and pending work

- No actual filesystem reader/custody, fixed9/7 descriptor reads, O_NOFOLLOW, cleanup/recovery gate, single-owner slot, or native10s wall guarantee was implemented or tested here. Synchronous finite copy/hash/parse cannot be preempted by the cooperative callback. Immutable JS strings cannot be securely wiped.
- No full scenario+cash schema/mapping, legacyv2/reader8 integration, HTTP8192 widening, replay/quota/fences, prepared input, actual author/reviewer/model/publisher execution, HTTP-PG, financial authority or production publication acceptance. This leaf must not substitute for any of those.
- No PG/native/build/install/browser/VPS/remoteDB/HTTP/crawl/CI/check/watch/ready/merge/deploy executed. No approval refs or signatures created. No source edits. Parent PR379 state is external and not verified or operated on by this review.
- This turn produced no new test RED. Experimental/type-stripping warnings are retained. Prior Root/reviewer RED remains at the original commits/reports, not overwritten.

Admission2026-10-14T07:47:04Z, deadline08:02:04Z; completed within window. Initial free /workspace8619077632 and /tmp15473590272; subsequent8618958848 /15473717248, both above8GiB. Independent probe peakRSS156804KiB (process highwater, not whole-task sampler); no heavy jobs. Initial broad process list contained historical zombies; explicit non-zombie Node/Postgres/Next filter returned empty. No services started, none need stopping, no deletions or cache changes. The task was saved, compressed and reread; no Root long thread or automation memory was consulted. Cloud/setup guidance applied without configuration change.

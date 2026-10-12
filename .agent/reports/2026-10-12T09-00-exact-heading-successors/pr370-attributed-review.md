# PR370 independent scoped code review

Result: `PASS` — unsigned scoped code opinion. P0=0, P1=0, P2=0.

- Base: `c6bc227ccaa5309226cbb833b35a35198491cb48`
- Reviewed head: `c0ad855257297706d714727e461684f723ac5875`
- Reviewed tree: `6f7cf33714bca2377377a3da5d1bfe8775eb8592`

I independently read the exact two runtime deltas, their two test deltas, the two operation handoffs, and directly relevant unchanged auth/lease/row-construction/calendar schema and build-bridge dependencies. The 84-path range contains four code/test paths, two operation documents and 78 historical report paths. The four changed source/test blobs match prior source `5ea9a2f083630460ab37e6a65dfcdfa2403f1211` exactly; the restored tool-main merge adds no extra application behavior. Historical evidence is not treated as a new protected approval.

Inbox admission remains after auth and complete existing input validation. Busy/acquisition failures do not write or release a foreign owner. The acquired owner is released once in finally for write success, client/query exceptions and database errors. Release errors cannot become successful responses, and the response distinguishes a possibly committed write from confirmed cleanup. The existing lease RPC semantics and backend database authority remain unchanged.

Calendar acquisition now freezes date heads rather than a raw revision prefix. The strict stable order includes authority ID; each date is finished across pages before its head is selected. Latest cancellation excludes the date without reviving an older completed revision; contradictory same-clock heads fail closed. Source/collection/recorded clocks use sub-millisecond comparisons and the original cutoff; selected sessions stay chronological. Page/aggregate row/byte limits, overflow sentinel, monotonic deadline and post-await clock checks reject incomplete acquisition before run creation.

Actual independent execution from an isolated exact Git extraction: **33 PASS / 0 FAIL / 0 SKIP**, Node22.23.3, including the real 30-second stalled-query abort. No tests or source were rewritten. Existing TypeScript dependencies were reused, and the five generated official-authority inputs were byte-identical exact Git runtime sources. No install or build was performed.

Raw: `/tmp/stockinsider-pr370-c0ad-independent-oct12.tap`  
SHA256: `e994b7839d81c6e015f1a947c0e489ff9044604d37209aa2818c76bbc56d6c46`  
Extraction manifest: `/tmp/stockinsider-pr370-c0ad-independent-oct12/manifest.json`  
SHA256: `05d8baf00c81edc63ddfc6d8288d790fba7f6bd9bb001dea47e3531c172938cf`

## Scope limits

- No real HTTP/PostgREST/PostgreSQL or production writes in this review. Auth/database/lease route boundaries use synthetic doubles; real route, validators and row construction execute.
- Calendar pagination uses synthetic thenable dependencies, including actual 30-second abort test. Historical production-row replay and Linux build evidence are not new execution here.
- Offset pagination relies on existing immutable calendar revisions, recorded-at cutoff and writer serialization; this review does not establish a new cross-request database snapshot or authority generation.
- Byte caps apply to selected parsed JSON accounting, not pre-parse network transport or hard process memory.
- Historical .agent evidence/probe files are classified as provenance; no claim every historical producer program was independently executed or reviewed as runtime.
- No whole-application/protected PASS, strategy authority, deployment, auth/model execution or GitHub status modification. GHA38186981588 remains separate.


## Independent successor identity-mirror closure

Independent reviewer /root/author_input_review_oct08 reviewed the shared two-file delta for exact successors 3706e2fd847757dc3f14879419ced5c8e080a7654c3,371f62bf26b9c938747c3a454ee2f9f351d4ac4523e,372e24ea452be598941f7ed97a11db57b23077dff8f: scoped CODE PASS P0/P1/P2=0. All three patches are identical. Approved catalog bytes remain unchanged at6759/SHA d0bed2c2d3db38d28145c903bdb0f9215f73266fbecf55826e25ee402dff5b64. The old protected traceability270PASS2FAIL is retained; HYB007/GOV004 both stopped at stale6758 literal. This correction only updates the fixed expected length/hash and adds two installation mirror assertions, retaining exact tree/working-byte/hash/owner/count checks. Same-length corruption and truncation remain rejected. Graph and model listing remain equal to each parent. The reviewer independently ran installation-contract2PASS/0FAIL/0SKIP. This supplements the attributed original functional reviews above, not a claim that this reviewer authored or re-reviewed every original370/372 feature. Fresh canonical execution for the new exact subject is recorded below only after completion.


## Independent exact heading-mirror closure

Independent reviewer /root/author_input_review_oct08 reviewed the identical two-file delta on 3703338160a43dd9c23e4ea4b079fd7761501c29786/tree2d67d5ecad2db71f24a5631f5c720f6ec4e9a164,371bc1b6aff5315c0f0302cd1d2e74e7c1b238a4af3/tree25679473dd66e681a47c9a9e4d20e2396c407bbc,372680d0c9d10ca185013d66f034e9fc03e1d7fcd69/tree6f3302450ebe54559ddf16e9d0095d713b46231f. Scoped CODE closure PASS P0/P1/P2=0. The approved amendment bytes are unchanged. The assertion matches the complete exact capitalized heading with line anchors, without case-insensitive or substring relaxation. The new regression extracts and evaluates exactly all three host-amendment literal mirrors. Independent negative probes reject lowercase, prefix, suffix and bare exact-pin text; installation-contract actually executed2PASS/0FAIL/0SKIP. This supplements the attributed original functional and catalog-mirror reviews; it is not full protected acceptance. Original protected270PASS2FAIL remains retained as a distinct metadata assertion failure.

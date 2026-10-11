# Financial queue missing lease repair

The deployed queue fetched 11 documents but persisted zero artifact receipts: `stockinsider_backend_lease_required`. This was observed read-only; no production data was changed. The missing lease is in the queue entry, separate from the previously repaired document upload/worker entry.

The route now acquires the existing production lease for 3,600 seconds after read-only prerequisites and before financial acquisition or validation, with explicit busy/unavailable failures. It releases only its acquired owner in finally. A second release failure is recorded with a fixed non-sensitive diagnostic; a worker exception remains primary. A release failure after successful workers prevents a success response. Authentication, request/provider limits, candidate filtering and financial results are preserved.

Independent bounded design review passed for `c4d376d27317776a3d045bd172aae246a21230f7`, spec SHA `1d48d14da951d24cc8104b039d7a554b20cebc83d6e78bd9899c5a7e3d9cd862`. This was unsigned scoped review, not protected/release authority.

Eight actual-route contract cases initially produced 3 passes / 5 failures on the unmodified route. The repair plus eight existing document-route regression cases produced 16/16, zero skip. Boundaries are synthetic; this is not real artifact/PostgreSQL acceptance. Test logs are retained locally with byte counts/hashes in the sanitized receipt. The queue change does not alter the strategy execution source closure; its generator check passes with existing codeHash `4ff97130999ee66808e05d1a253cece453141bc704c8050a581b955f4205e664` and parameterHash `9101ef58a0d43f53e7dea0749eb03872f375bb3051cfd77e6147d9141e2334e4`.

Pending: independent exact-code review; Codex VM full types/lint/normal build and isolated real-stack acceptance; actual protected release prerequisites. No main merge, production queue execution, deployment, financial coverage or strategy profitability claim is made.

## Actual VM acceptance and ordinary-CI integration failure

The VM receipt is now committed alongside its runnable real-stack probe and TAP. It proves 16 focused cases, 6 synthetic real-stack tests (including parent), typecheck/lint/build; it does not prove positive production-worker acquisition/validation. The original runtime remains `1b8aa0d`. Ordinary CI on docs successor549 subsequently failed 21 cases: two new strict suites lacked installed-PG discovery and 19 existing priority contract cases lacked the observed module. The independently design-reviewed repair is test-only; no runtime or protected workflow is changed. Root focused selection is35/35, zero skip; log8,673bytes SHA256 `5b4d588e9aad9daad20c4af7e48e04e5aa51bc0a51a6d6766c2439696c92560e`. Actual CI PG re-execution and exact test-only review are pending.

# Financial queue missing lease repair

The deployed queue fetched 11 documents but persisted zero artifact receipts: `stockinsider_backend_lease_required`. This was observed read-only; no production data was changed. The missing lease is in the queue entry, separate from the previously repaired document upload/worker entry.

The route now acquires the existing production lease for 3,600 seconds after read-only prerequisites and before financial acquisition or validation, with explicit busy/unavailable failures. It releases only its acquired owner in finally. A second release failure is recorded with a fixed non-sensitive diagnostic; a worker exception remains primary. A release failure after successful workers prevents a success response. Authentication, request/provider limits, candidate filtering and financial results are preserved.

Independent bounded design review passed for `c4d376d27317776a3d045bd172aae246a21230f7`, spec SHA `1d48d14da951d24cc8104b039d7a554b20cebc83d6e78bd9899c5a7e3d9cd862`. This was unsigned scoped review, not protected/release authority.

Eight actual-route contract cases initially produced 3 passes / 5 failures on the unmodified route. The repair plus eight existing document-route regression cases produced 16/16, zero skip. Boundaries are synthetic; this is not real artifact/PostgreSQL acceptance. Test logs are retained locally with byte counts/hashes in the sanitized receipt. The queue change does not alter the strategy execution source closure; its generator check passes with existing codeHash `4ff97130999ee66808e05d1a253cece453141bc704c8050a581b955f4205e664` and parameterHash `9101ef58a0d43f53e7dea0749eb03872f375bb3051cfd77e6147d9141e2334e4`.

Pending: independent exact-code review; Codex VM full types/lint/normal build and isolated real-stack acceptance; actual protected release prerequisites. No main merge, production queue execution, deployment, financial coverage or strategy profitability claim is made.

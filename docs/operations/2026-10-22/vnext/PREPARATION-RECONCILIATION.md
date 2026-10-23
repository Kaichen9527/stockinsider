# Explicit preparation READ and cached reconciliation

Base: `1afaa8158e3ee670e481781da936f9b75c02bcb7`. Runtime prior: `e359d7d634fa88db938fd57db8b4a33123006904`. This source slice changes four TypeScript files; no SQL, grants, profiles, quotas or source rights change.

The configured author can request `preparation-read` or explicit `resume-preparation` with only an existing job UUID. READ uses the current job/provider journal, original work-context fences and bounded existing financial receipts/facts, provenance, instrument/calendar and price authority. It cannot acquire documents, parse, validate, claim, renew, fail work or invoke a model. A prepared result is a limited state observation, not a full immutable database row/clock receipt. Read of queued or historical work exposes no raw author/provider output.

Explicit resume permits one original `prepare` command only after current rights/execution/journal are rechecked. Only that mutation acquires the original writer lease. The existing SQL mutex and immutable first preparation serialize it against provider reservation. An unknown response is uncertain: only a later explicit READ can determine whether preparation persisted. There is no automatic second mutation, clock refresh, failure/refund or model resend.

Ordinary preparation and reconciliation share the same frozen financial projection. Independent extraction of the prior Git body compared whole outputs and hashes for three price/evidence cases; exact existing policy and financial calculations remain authoritative. A cancelled calendar is not silently treated as the prior completed session; the original historical adapter independently validates its query anchor and complete chain.

## Actual VM source checks

- `preparation-reconciliation-source-05`: 10 PASS, no fail/skip. Real HTTP-handler/store functions and installed NextResponse, synthetic DB/cache/lease/historical transports. No network HTTP or PostgreSQL proof.
- `preparation-reconciliation-types-02`: full TypeScript noEmit, incremental false, exit0.
- `preparation-focused-lint-o23`: four changed files, exit0.
- `preparation-reconciliation-failure-regression-01`: six focused original failure contracts PASS.
- `preparation-root-parity-02-o23`: three independent old-Git/full-output parity groups PASS.

Earlier source01 test adapter arity failure, types01 compiler errors and sandbox spawnSync parity-tool EPERM remain preserved. The source01 preimage was reconstructed later and is explicitly not a contemporaneous exact seal; the source04/types01 four-file archive is exact. Final source05 bytes match the committed four-file inventory.

All recorded checks held 8589934592 bytes free on both filesystems and sampled process-tree RSS below8GiB; sampling is not an instantaneous peak. Workspace margin is about303MB. A fresh clone/container and a new full VM build are NOT_ADMITTED with their measured working sets plus reserve; no cache/PG/raw/history cleanup or floor reduction is authorized by this slice. Prior full build/native receipts do not transfer to this source.

## Remaining acceptance

Actual PostgreSQL/HTTP uncertainty and concurrent first-prepare recovery on this source, full new-head build/browser regression, fresh complete installer and real source/provider/semantic/staging acceptance are NOT_RUN. This closes a code integration gap, not formal research or deployment approval. Draft PR384, protected gates and the overall release remain incomplete.

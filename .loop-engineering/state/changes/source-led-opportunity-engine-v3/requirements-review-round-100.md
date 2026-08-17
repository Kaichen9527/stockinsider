# V3.16.21 single fresh Requirements review

Date: 2026-08-17
Review authority: the one permitted fresh Requirements review for the V3.16.21
successor release, performed read-only against the immutable implementation subject.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `330973bcd8b06db399d82ceb194b74c3d8e4d521`
- Final repair-closure commit/tree: `3d97bcda5442971b526af42e3e7b71926126922a` / `6adf0aa5b13e29fee111bff838cc05031be1fd6c`
- Full reviewed range: `330973bcd8b06db399d82ceb194b74c3d8e4d521..3d97bcda5442971b526af42e3e7b71926126922a`
- Active graph: `176ae0d91ca1912d7bcb68cc48c0e94a18ab01e47956e55456ef434400bd2ea7`

## Requirements closure

The implementation satisfies the V3.16.21 frozen-acquisition contract without
reopening the already-passed V3.16.20 gates. Every live provider request is captured
once into an append-only, hash-bound envelope with its real `fetchedAt`; a retry
reuses the completed request key, a conflicting response is quarantined, and the
database prevents service-role table writes outside the exact leased RPC.

The database-owned evaluation clock advances to the latest immutable acquisition
time for the current run. It never rewrites `fetchedAt` or the source cutoff, so a
current analysis can use evidence that actually arrived while a historical cohort
cannot consume evidence fetched in its future. Action authority binds the complete
provider lineage and official coverage, not one mutable fact fetch or a predecessor
projection.

Public Radar and authenticated health use the same checksum, freshness, runtime,
consumer/producer, manifest, migration and acquisition checks. Every mismatch
disables action; checksum-valid research remains visible as read-only and checksum
conflict alone clears it. Legacy V3.12 cards and stale V3.14 cards remain navigable
through a bounded research-only detail whose source link accepts HTTPS only. Missing
authority is shown as a typed blocker rather than `avoid` or a fabricated buy.

The additive migration applies twice on a fresh database and its executable
`appended -> reused -> conflict` lifecycle passes. Product correctness passes
`115/115`, V3.16.21 focused coverage passes `6/6`, migration passes `59/59`,
performance passes `5/5`, typecheck, lint and production build pass, and model-runner
passes `18/18` with disabled host-pin v3.9 doctor PASS. No password reset, credential
rotation, LINE, dispatch, automatic trading or V3 Promotion is introduced.

Protected owner execution exposed one traceability root rather than a product
requirement defect: the new amendment lacked its canonical version header and the
script-value registry still described the predecessor product-correctness command.
The repair adds the canonical declaration, updates and re-hashes the closed command
registry, and binds current-task disposition to the machine-readable release phase.
The three formerly failing structural owners now pass `3/3`; no requirement scope,
authority boundary, public interface, migration behavior, or action rule changed.
Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; this Requirements PASS makes
no claim that future returns are proven.

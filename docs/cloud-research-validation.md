# Cloud-primary research validation, VPS durability, transitional Mac

This dependent implementation is a bounded work/result adapter. It is not proof
that real sources, six-role model dispatch, automatic Cloud scheduling or accepted
AUO research is live. Protected recovery/merge, reviewed production migrations and
whole-host capacity remain outstanding. Do not republish the dated AUO demo as new
research merely because accounting acceptance passes.

## Runtime boundary

VPS retains history, source rights/provenance, immutable queues, reservations,
paper books and authenticated result/publication state. Cloud uses one exact
source commit and one permitted evidence packet. Mac continues authenticated
browser reading, the protected macOS runner and existing backups. Never move
cookies, auth.json, production DB/service-role credentials or strategy approval
keys into the Cloud model workspace. A result hash is content integrity, not a
signature, proof of source accuracy or independent financial review.

`research-cloud-work.ts` binds kind/role, job/attempt/owner/reservation, source
commit, <=30-minute same-Taipei-day expiry, cutoff-visible summaries and input
hash. JSON, excerpts, URLs, identities and result sizes are bounded. The original
controller-held task is required to verify a returned result. Summary projection
and source rights remain a prerequisite; the adapter's field checks are not a
complete secret/private-content detector.

`deep_article_validation` recomputes with the same financial/article validator
used by production submission. Results explicitly require live reservation
acceptance and separate independent review/publication. The other model kinds
have typed identities but no dispatcher; `run` rejects them rather than claiming
execution. Exact rejected/withdrawn/future evidence remains rejected.

## Trusted controller → Cloud → controller

1. Prepare the rights-aware input and compute `cloudReservationWorkKey()` before
   dispatch. Reserve `independent_test` through `research-model-reservation` with
   the independent tester principal. No author/reviewer/approval key is shared.
2. Attach the actual returned reservation ID and its server `started_at` and
   `lease_expires_at`, then create/seal the work. Keep the original on the trusted
   controller; transfer only its permitted packet to Cloud.
3. In Cloud check out the exact source SHA, install from its committed lockfiles,
   keep tracked files clean and explicitly run the task. No VM cron/daemon is
   treated as a supported persistent Cloud scheduler. Default saved task state is
   not a durable archive; commit work and return important artifacts to VPS.
4. Back on the trusted controller verify against the original task and submit
   `{work,result}` to authenticated `research-cloud-result`. It accepts only
   non-synthetic independent-test packets bound to the actual immutable
   reservation work key and server timestamps. It rereads current source heads
   and cutoff-visible official fact IDs, recomputes, then completes through the
   existing SQL function. Exact durable retries replay the original completion;
   changed bytes or expired uncompleted work reject.
5. The receipt completes test work only. Actual deep publication continues through
   `research-deep-review`, the exact outbox claim and `candidate-dossier-submission`;
   strategies retain their separate independent validation and human approval.

## Portable CLI

Node22 with native type stripping is required. Use absolute task/output paths.
`prepare` is run by the trusted controller; `run` by Cloud; `verify` by the
controller. Outputs use create-only mode0600 and must not overwrite evidence.

```sh
npm run research:cloud -- prepare --input /absolute/controller-input.json --output /absolute/task.json
npm run research:cloud -- run --task /absolute/task.json --output /absolute/result.json --workspace /workspace
npm run research:cloud -- verify --task /absolute/task.json --result /absolute/result.json --output /absolute/handoff.json
```

The workspace must contain the executing repository and all retained runtime,
cache and task data being counted. Cloud run requires current Linux statfs,
meminfo, cgroup memory observations and du accounting. It uses an atomic sandbox
heavy-task lock with no uncertain stale takeover. Production global model fencing
still lives in VPS and requires a controller watchdog; this lock is not a model
budget or a replacement for the existing heavy-operation wrapper.

Capacity profile:20 GB counted resident,<=4 GB additional temporary,>=8 GB free
reserve after the peak,<=8 GiB expected RAM with512 MiB memory reserve. Unknown
project quota remains explicitly unknown; df/du scopes are not subtracted. This
separate validation profile never changes the Contabo production policy. Storage
or memory failure queues/batches work; it never deletes historical evidence.

## Acceptance status

`npm run test:research-cloud` runs contract, math, quota/memory and actual-route
boundary tests. `scripts/fixtures/research-cloud-article.ts` is explicitly
synthetic and cannot enter the live result endpoint. Fixture values are not AUO
financial facts or an article, and fixture reservation IDs do not consume or prove
real model budget. Actual Cloud execution and real VPS acceptance are separately
recorded; local fixtures do not close those tasks.

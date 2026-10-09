# Tasks

- [x] Observe real failed queue run without modifying production.
- [x] Freeze bounded repair requirements, ownership and executable acceptance inventory.
- [x] Independent requirements/design review: unsigned scoped PASS for `c4d376d27317776a3d045bd172aae246a21230f7` / spec SHA `1d48d14da951d24cc8104b039d7a554b20cebc83d6e78bd9899c5a7e3d9cd862`. Dual worker/release failure must preserve the worker exception and record release failure without success.
- [x] Implement authenticated route lease and executable acceptance cases FQL-01 through FQL-08, including dual worker/release failure.
- [x] Preserve original red (3 pass / 5 fail) and obtain focused green (16/16 including existing document-route regression, zero skip). Existing strategy release check passes unchanged; queue route is outside its selected strategy source closure.
- [ ] Independent exact-code review and VM real-stack/type/lint/build verification.
- [ ] Push sanitized evidence and attach draft PR; release only after actual protected prerequisites pass.

### Subsequent evidence and test-only CI repair

- [x] Independent exact runtime review passed `1b8aa0d`: 16 focused cases plus three adversarial probes.
- [x] VM exact `549d97a` type/lint/normal build and 16 focused + 6 real-stack cases passed; HTTP real-stack cases are rejection-only, helper/artifact cases use actual PG/PostgREST/private FD store. Full positive official worker remains unverified. Initial sandbox/cache build failures preserved.
- [x] Push/attach draft PR333, retain no protected-release claim.
- [x] Preserve ordinary CI 469 pass / 21 fail / 3 skip out of 493; diagnose two missing PG discoveries and 19 priority harness imports.
- [x] Independent bounded CI-design PASS; implement only two PG discovery preludes and the reviewed actual-module priority fixture patch. Local queue/document/priority selection 35/35, zero skip.
- [ ] Exact test-only review and actual ordinary CI rerun of both strict PG suites.
- [ ] Protected review, production rollout and actual official queue success; the original deployment still has the missing lease until reviewed deployment.

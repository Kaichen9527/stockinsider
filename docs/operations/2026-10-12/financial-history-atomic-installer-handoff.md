# Financial-only atomic installer slice

Base b48b3b0b9e9ac5464609ef6a2e2acf735a3834b2, feature merge approved main 4dddb8f01f518350c7d54b7995ee9358c1d945a7. No reader, SQL, package/lock, authority artifact, role, PCR catalog or production data edits.

## Selection and authority

Default 48 migration paths, bytes and ordered digest remain unchanged (37dfacc252ec24a719b898b2b3ea31fc77c1631db083211f1f171c956772c613). Explicit `--financial-history-extension` selects only the same 48 plus unchanged `20261005_financial_history_admission_v1.sql`, SHA256 5494165e6163d9e63e1649f0214865f5ad4c9ffb262e00dd6073cc1be4124e27. No research/publication bundle is selected. Planner extension output is not apply authorization.

Apply retains clean exact source, existing runtime exact-review direct-child attestation resolution and existing production migration authority. Financial opt-in additionally requires exactly one literal `Financial history ordered chain SHA256: <49 ordered hash>` in the review text whose entire bytes are already bound by the validated attestation evidence hash. A flag or caller hash alone does not authorize it. No authority/attestation files were generated or edited, and no actual approved financial apply was attempted. Independent review must assess this binding addition before acceptance.

## Transaction and installed-state protection

One nonblocking shared advisory install lock, then one READ COMMITTED transaction covers installed-state checks, successor detection, all scanner-normalized selected bodies, existing postconditions plus financial postconditions, and COMMIT. Embedded transaction controls are rejected by the previously repaired lexical scanner. Failure attempts ROLLBACK; session disconnect/close also releases server transactions/locks. Primary errors survive cleanup errors. CLI errors remain generic.

Before any older body runs, observation/private-wrapper/page-reader/index/period-trigger residue is checked. Base-only replay rejects any installed financial successor; partial financial residue rejects financial replay. Complete installed financial state must satisfy pinned complete function-body fingerprints, observation RLS/owner/ACL, private wrapper boundary, immutable trigger, page reader and owner no-CREATE checks. Selected tail bytes/hash and ordered base hash are pinned. Public research/cloud tables and known new model/observed RPCs reject this narrow replay; known legacy research_memos/research_reports/research_dossiers are not mistaken for cloud successors. This conservative deny boundary does not claim exhaustive detection of arbitrarily renamed future extensions.

## Actual verification scope

Original full atomic pure eight-case suite is now executable, with installer BEGIN/COMMIT/postcondition/ROLLBACK assertions unchanged. New selection/guard/transaction-client tests exercise 49 ordering/hash, missing/wrong tail, binding omission, partial residue, base-only downgrade, unknown research successor, busy admission, postcondition rollback and disconnect/error paths. Transaction clients in those tests are explicit synthetic clients, not native PostgreSQL installation proof.

Original native three-case predecessor/baseline/amendment/forced-rollback selection remains real local PG17 on the existing synthetic legacy prerequisite fixture. It is separate from and does not verify the new guard/postcondition queries or new installer. Original failed outputs remain in unique receipts; adjacent wrong Node invocation and sandbox file-level failures are separately attributed.

## Still required

Actual existing-schema 49-file apply twice, forced rollback, partial residue/modified body, disconnect, concurrent installs and the new SQL postconditions/guard must be exercised on the genuine schema-only profile. This slice has not extracted or substituted a full-profile fixture. Source-review literal binding still needs exact independent review, followed by normal protected checks and actual capacity authorization. No production installation, 343 usable repair, financial verification, strategy adoption, model role execution or deployment is claimed.

# Remote source transport repair

## Finding

The latest PR head `7810eae66561f100d77ae180d5fb852472fb7514` is mergeable but not reviewable or deployable. GitHub Actions run `36115793913` failed TypeScript immediately because `web/src/lib/research-v2.ts` appeared binary. The remote Git blob is `f11642231664b5f6f4968e5cda0cb8d5fd5bf482`, 180,061 bytes, and GitHub cannot decode it as UTF-8.

The intended local file is valid UTF-8 TypeScript, 280,941 bytes, Git blob `bf1654ba05aa5728b47cbc2a9455df7f98d390c2`, SHA256 `d68e27cd4ea5f4242a2f86db1d0b071783040bdd44fdee1439b994e506123822`. It was included in the successful local TypeScript and 91-page production build from the immediately preceding iteration. This is a remote transport defect, not a strategy, calculation, or research-data change.

## Repair rule

Re-upload the exact intended local bytes as a new Git blob, verify GitHub returns the same Git blob SHA, then create a new fast-forward commit from the failed head. Preserve runs `36115793913` and `36115791000` as failed evidence; do not rerun them in place or claim their gates passed.

## Separate protected-gate blocker

Requirements, Architecture, and Exact-review also failed because the protected worker could not find an independent exact-review branch for the new head. That is separate from the corrupted file and must remain blocked until genuine reviewers generate head-bound evidence. This repair does not create, copy, or modify review attestations.

## Boundaries

No production database, deployment, 2024+ holdout, strategy parameter, article, or capacity control was touched. The development results remain unchanged. A new commit must receive fresh checks before review can continue.

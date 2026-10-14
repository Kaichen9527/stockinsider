set -euo pipefail
gh api repos/Kaichen9527/stockinsider/actions/runs/38580440366 > "$RUNNER_TEMP/standalone-export/upstream-run.json"
gh api repos/Kaichen9527/stockinsider/actions/artifacts/11904225538 > "$RUNNER_TEMP/standalone-export/upstream-artifact-metadata.json"
gh api repos/Kaichen9527/stockinsider/actions/artifacts/11904225538/zip > "$RUNNER_TEMP/reviewed-existing-artifact.zip"

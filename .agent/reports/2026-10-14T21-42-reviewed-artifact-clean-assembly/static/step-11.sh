set -euo pipefail
test "$(git rev-parse HEAD)" = "$REVIEWED_SOURCE"
test -z "$(git status --porcelain --untracked-files=no)"
destination="$RUNNER_TEMP/reviewed-standalone"
export_dir="$RUNNER_TEMP/standalone-export"
mkdir -m 0700 "$destination"
node scripts/package-standalone-release.mjs "$GITHUB_WORKSPACE" "$GITHUB_WORKSPACE" "$destination" "$REVIEWED_SOURCE" "$REVIEWED_SOURCE" > "$export_dir/package.json"
node scripts/verify-standalone-release.mjs "$destination/$REVIEWED_SOURCE" > "$export_dir/verification.json"
cp "$destination/$REVIEWED_SOURCE/release-manifest.json" "$export_dir/release-manifest.json"
git rev-parse HEAD HEAD^{tree} HEAD:web > "$export_dir/source-identity.txt"


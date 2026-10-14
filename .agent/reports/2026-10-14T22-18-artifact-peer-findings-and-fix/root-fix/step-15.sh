set -euo pipefail
export_dir="$RUNNER_TEMP/standalone-export"
tar -czf "$export_dir/stockinsider-linux.tar.gz" -C "$RUNNER_TEMP/reviewed-standalone" "$REVIEWED_SOURCE"
(cd "$export_dir" && sha256sum stockinsider-linux.tar.gz release-manifest.json package.json verification.json source-identity.txt review-binding.json builder-canonical.log builder-canonical.tap builder-correctness.json packaged-boot.json packaged-boot.stdout packaged-boot.stderr > SHA256SUMS)

set -euo pipefail
export_dir="$RUNNER_TEMP/standalone-export"
(cd "$export_dir" && find . -type f ! -path ./SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
test "$(sha256sum "$export_dir/upstream/stockinsider-linux.tar.gz" | cut -d' ' -f1)" = 398e71768ea0e7a5935282432c0edfcb2f47c953712b715562def95c3745add4

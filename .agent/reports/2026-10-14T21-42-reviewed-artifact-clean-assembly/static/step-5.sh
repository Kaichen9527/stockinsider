set -euo pipefail
test "$(git show -s --format=%P "$REVIEW_EVIDENCE")" = "$REVIEWED_SOURCE"
git checkout --detach "$REVIEWED_SOURCE"
test "$(git rev-parse HEAD)" = "$REVIEWED_SOURCE"
test "$(git rev-parse HEAD^{tree})" = "$REVIEWED_TREE"
test "$(git rev-parse HEAD:web)" = "$REVIEWED_WEB_TREE"
test -z "$(git status --porcelain --untracked-files=all)"


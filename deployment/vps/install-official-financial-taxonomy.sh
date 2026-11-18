#!/usr/bin/env bash
set -euo pipefail

# Installs the reviewed Taiwan IFRS taxonomy from an operator-supplied archive.
# The parser remains network-isolated and can only read the immutable result.
test "$(id -u)" = 0
test "$#" = 1
archive="$1"
current_sha256='4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'
historical_sha256='8b1910ec2dff01b91227255c82dd92385d4db6664b3a5a638ac7086ebe7dad17'
root='/opt/stockinsider/runtime/candidate-financial-parser/taxonomy'


test -f "$archive"
test ! -L "$archive"
install -d -m 0755 -o root -g root "$root"
staging="$(mktemp -d "$root/.taxonomy-stage.XXXXXX")"
cleanup() { rm -rf -- "${staging:?}"; }
trap cleanup EXIT
private_archive="$staging/taxonomy.zip"
payload="$staging/payload"
install -m 0600 -o root -g root -- "$archive" "$private_archive"
actual_sha256="$(sha256sum "$private_archive" | cut -d ' ' -f 1)"
case "$actual_sha256" in
  "$current_sha256")
    version='tifrs-20260331-4e44e67647b1'
    set -- 'tifrs-ci-cr-2026-03-31.xsd' 'tifrs-basi-cr-2026-03-31.xsd' 'tifrs-basi-ir-2026-03-31.xsd'
    ;;
  "$historical_sha256")
    version='tifrs-20200630-8b1910ec2dff'
    set -- 'tifrs-ci-cr-2020-06-30.xsd' 'tifrs-basi-cr-2020-06-30.xsd' 'tifrs-basi-ir-2020-06-30.xsd'
    ;;
  *)
    echo 'taxonomy_archive_digest_unreviewed' >&2
    exit 1
    ;;
esac
target="$root/$version"
install -d -m 0755 -o root -g root "$payload"

python3 - "$private_archive" "$payload" <<'PY'
import pathlib, sys, zipfile
archive = pathlib.Path(sys.argv[1]).resolve(strict=True)
destination = pathlib.Path(sys.argv[2]).resolve(strict=True)
with zipfile.ZipFile(archive) as source:
    members = source.infolist()
    if not members or len(members) > 20000:
        raise SystemExit('taxonomy_archive_cardinality_invalid')
    total = 0
    for member in members:
        path = pathlib.PurePosixPath(member.filename)
        if path.is_absolute() or '..' in path.parts or '\\' in member.filename:
            raise SystemExit('taxonomy_archive_path_invalid')
        total += member.file_size
        if total > 128 * 1024 * 1024:
            raise SystemExit('taxonomy_archive_uncompressed_size_invalid')
        mode = member.external_attr >> 16
        if mode & 0o170000 == 0o120000:
            raise SystemExit('taxonomy_archive_symlink_rejected')
    source.extractall(destination)
PY

for entrypoint; do
  test "$(find "$payload" -type f -name "$entrypoint" | wc -l | tr -d ' ')" = 1
done
printf '%s\n' "$actual_sha256" > "$payload/.archive-sha256"
find "$payload" -type d -exec chmod 0755 {} +
find "$payload" -type f -exec chmod 0644 {} +
chown -R root:root "$payload"

# Serialize installations, including the atomic current pointer update.
exec 9>"$root/.install.lock"
flock -x 9
if [ -e "$target" ]; then
  test -d "$target"
  test ! -L "$target"
  test "$(head -n 1 "$target/.archive-sha256")" = "$actual_sha256"
else
  mv -- "$payload" "$target"
fi
if [ "$actual_sha256" = "$current_sha256" ]; then
  ln -sfn -- "$version" "$root/.current-next"
  mv -Tf -- "$root/.current-next" "$root/current"
fi
trap - EXIT
if [ -d "$staging" ]; then rm -rf -- "${staging:?}"; fi
printf '%s\n' "$actual_sha256"

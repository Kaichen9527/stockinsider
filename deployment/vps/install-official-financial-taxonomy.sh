#!/usr/bin/env bash
set -euo pipefail

# Installs the reviewed Taiwan IFRS taxonomy from an operator-supplied archive.
# The parser remains network-isolated and can only read the immutable result.
test "$(id -u)" = 0
test "$#" = 1
archive="$1"
expected_sha256='4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869'
version='tifrs-20260331-4e44e67647b1'
root='/opt/stockinsider/runtime/candidate-financial-parser/taxonomy'
target="$root/$version"

test -f "$archive"
test ! -L "$archive"
actual_sha256="$(sha256sum "$archive" | cut -d ' ' -f 1)"
test "$actual_sha256" = "$expected_sha256"

install -d -m 0755 -o root -g root "$root"
staging="$(mktemp -d "$root/.taxonomy-stage.XXXXXX")"
cleanup() { rm -rf -- "${staging:?}"; }
trap cleanup EXIT

python3 - "$archive" "$staging" <<'PY'
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

test "$(find "$staging" -type f -name 'tifrs-ci-cr-2026-03-31.xsd' | wc -l | tr -d ' ')" = 1
test "$(find "$staging" -type f -name 'tifrs-ci-basi-2026-03-31.xsd' | wc -l | tr -d ' ')" = 1
find "$staging" -type d -exec chmod 0755 {} +
find "$staging" -type f -exec chmod 0644 {} +
chown -R root:root "$staging"

if [ -e "$target" ]; then
  test -d "$target"
else
  mv -- "$staging" "$target"
fi
ln -sfn -- "$version" "$root/.current-next"
mv -Tf -- "$root/.current-next" "$root/current"
trap - EXIT
if [ -d "$staging" ]; then rm -rf -- "${staging:?}"; fi
printf '%s\n' "$actual_sha256"

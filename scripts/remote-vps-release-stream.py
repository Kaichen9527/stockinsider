#!/usr/bin/env python3
"""Read-only, deterministic release tar stream with before/after tree evidence."""
import hashlib
import io
import json
import os
import re
import stat
import sys
import tarfile

PATH_RE = re.compile(r"^/opt/[a-z0-9._-]+/releases/[A-Za-z0-9._-]+$")
MAX_FILES = 100_000
MAX_BYTES = 8 * 1024**3
META_PREFIX = "STOCKINSIDER_META\t"


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def read_file(path, expected):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(descriptor)
        identity = (before.st_dev, before.st_ino, before.st_size, stat.S_IMODE(before.st_mode), before.st_mtime_ns)
        if identity != expected or not stat.S_ISREG(before.st_mode):
            raise RuntimeError("release_file_changed")
        digest = hashlib.sha256()
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
        after = os.fstat(descriptor)
        if identity != (after.st_dev, after.st_ino, after.st_size, stat.S_IMODE(after.st_mode), after.st_mtime_ns):
            raise RuntimeError("release_file_changed")
        os.lseek(descriptor, 0, os.SEEK_SET)
        return descriptor, digest.hexdigest()
    except Exception:
        os.close(descriptor)
        raise


def scan(root):
    records = []
    total = 0
    for directory, names, filenames in os.walk(root, topdown=True, followlinks=False):
        names.sort()
        filenames.sort()
        for name in list(names):
            target = os.path.join(directory, name)
            metadata = os.lstat(target)
            if not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
                raise RuntimeError("release_special_file_rejected")
        for name in filenames:
            target = os.path.join(directory, name)
            metadata = os.lstat(target)
            if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
                raise RuntimeError("release_special_file_rejected")
            relative = os.path.relpath(target, root).replace(os.sep, "/")
            if relative.startswith("../") or relative.startswith("/") or any(part in ("", ".", "..") for part in relative.split("/")):
                raise RuntimeError("release_path_invalid")
            identity = (metadata.st_dev, metadata.st_ino, metadata.st_size,
                        stat.S_IMODE(metadata.st_mode), metadata.st_mtime_ns)
            descriptor, digest = read_file(target, identity)
            os.close(descriptor)
            total += metadata.st_size
            if total > MAX_BYTES or len(records) >= MAX_FILES:
                raise RuntimeError("release_tree_limit_exceeded")
            records.append({"path": relative, "bytes": metadata.st_size,
                            "mode": stat.S_IMODE(metadata.st_mode), "mtimeMs": metadata.st_mtime_ns // 1_000_000,
                            "sha256": digest})
    records.sort(key=lambda item: item["path"])
    tree = {"schema": "stockinsider-vps-release-tree-v1", "releasePath": root,
            "fileCount": len(records), "totalBytes": total, "files": records}
    tree["treeSha256"] = hashlib.sha256(canonical(tree)).hexdigest()
    return tree


def main():
    if len(sys.argv) != 2 or not PATH_RE.fullmatch(sys.argv[1]):
        raise RuntimeError("explicit_release_path_required")
    root = sys.argv[1]
    metadata = os.lstat(root)
    if not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode) or os.path.realpath(root) != root:
        raise RuntimeError("release_directory_invalid")
    before = scan(root)
    sys.stderr.write(META_PREFIX + json.dumps({"phase": "before", "tree": before}, separators=(",", ":")) + "\n")
    sys.stderr.flush()
    manifest_bytes = canonical(before)
    with tarfile.open(fileobj=sys.stdout.buffer, mode="w|", format=tarfile.USTAR_FORMAT) as archive:
        info = tarfile.TarInfo(".stockinsider-release-manifest.json")
        info.size = len(manifest_bytes)
        info.mode = 0o600
        info.mtime = 0
        archive.addfile(info, io.BytesIO(manifest_bytes))
        for record in before["files"]:
            target = os.path.join(root, *record["path"].split("/"))
            metadata = os.lstat(target)
            identity = (metadata.st_dev, metadata.st_ino, metadata.st_size,
                        stat.S_IMODE(metadata.st_mode), metadata.st_mtime_ns)
            descriptor, digest = read_file(target, identity)
            if digest != record["sha256"]:
                os.close(descriptor)
                raise RuntimeError("release_file_changed")
            try:
                info = tarfile.TarInfo(record["path"])
                info.size = record["bytes"]
                info.mode = record["mode"]
                info.mtime = record["mtimeMs"] // 1_000
                archive.addfile(info, os.fdopen(descriptor, "rb", closefd=False))
            finally:
                os.close(descriptor)
    after = scan(root)
    sys.stderr.write(META_PREFIX + json.dumps({"phase": "after", "tree": after}, separators=(",", ":")) + "\n")
    sys.stderr.flush()
    if canonical(before) != canonical(after):
        raise RuntimeError("release_tree_changed")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        sys.stderr.write(META_PREFIX + json.dumps({"phase": "failed", "reason": str(error)}, separators=(",", ":")) + "\n")
        sys.stderr.flush()
        raise SystemExit(1)

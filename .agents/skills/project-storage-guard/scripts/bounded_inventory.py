#!/usr/bin/env python3
"""Read-only bounded metadata inventory of explicitly selected subdirectories."""
import argparse
import json
import math
import os
from pathlib import Path
import stat
import time

CLOUD_PARTS = {"Mobile Documents", "CloudStorage", "OneDrive", "Dropbox", "Google Drive"}
PROTECTED_PARTS = {".git"}


def selected_path(root, relative):
    rel = Path(relative)
    if (not relative.strip() or rel.is_absolute() or rel == Path(".")
            or any(p in {".."} | PROTECTED_PARTS | CLOUD_PARTS for p in rel.parts)):
        raise ValueError("directory must be a selected non-cloud relative subdirectory")
    path = root
    for part in rel.parts:
        path = path / part
        if path.is_symlink():
            raise ValueError("symlink paths are not followed")
    path = path.resolve(strict=True)
    if root not in path.parents or not path.is_dir():
        raise ValueError("directory must be an existing subdirectory of root")
    return path


def inventory(root, selections, max_entries=500, max_depth=1, max_seconds=3):
    root = Path(root)
    if root.is_symlink():
        raise ValueError("symlink root is not allowed")
    root = root.resolve(strict=True)
    if not root.is_dir() or any(part in CLOUD_PARTS for part in root.parts):
        raise ValueError("root must be an existing non-cloud directory")
    if (not 1 <= len(selections) <= 8 or not 1 <= max_entries <= 5000
            or not 0 <= max_depth <= 4 or not math.isfinite(max_seconds)
            or not 0 < max_seconds <= 10):
        raise ValueError("invalid inventory limits")
    paths = [selected_path(root, item) for item in selections]
    for i, a in enumerate(paths):
        for b in paths[i + 1:]:
            if a == b or a in b.parents or b in a.parents:
                raise ValueError("selected directories must not overlap")
    result = {"schema_version": 1, "complete": True, "entries_seen": 0,
              "regular_files_observed": 0, "logical_bytes_observed": 0,
              "allocated_bytes_observed": 0, "allocated_bytes_known": True,
              "hardlink_duplicates": 0, "skipped": {}, "stop_reason": None,
              "note": "Observed metadata only; bytes are not reclaimable-space estimates. No files were read or changed."}
    deadline = time.monotonic() + max_seconds
    device = root.stat().st_dev
    seen = set()
    stack = [(path, 0) for path in reversed(paths)]

    def skip(reason):
        result["complete"] = False
        result["skipped"][reason] = result["skipped"].get(reason, 0) + 1

    while stack:
        if time.monotonic() >= deadline:
            result.update(complete=False, stop_reason="time_limit")
            break
        path, depth = stack.pop()
        try:
            st = path.lstat()
            if stat.S_ISLNK(st.st_mode):
                skip("symlink")
                continue
            if st.st_dev != device:
                skip("different_volume")
                continue
            if getattr(st, "st_flags", 0) & getattr(stat, "SF_DATALESS", 0x40000000):
                skip("cloud_placeholder")
                continue
            with os.scandir(path) as entries:
                for entry in entries:
                    if result["entries_seen"] >= max_entries:
                        result.update(complete=False, stop_reason="entry_limit")
                        return result
                    if time.monotonic() >= deadline:
                        result.update(complete=False, stop_reason="time_limit")
                        return result
                    result["entries_seen"] += 1
                    if entry.name in PROTECTED_PARTS | CLOUD_PARTS or entry.name.endswith(".icloud"):
                        skip("protected_or_cloud")
                        continue
                    try:
                        item = entry.stat(follow_symlinks=False)
                    except OSError:
                        skip("unreadable")
                        continue
                    if stat.S_ISLNK(item.st_mode):
                        skip("symlink")
                    elif item.st_dev != device:
                        skip("different_volume")
                    elif getattr(item, "st_flags", 0) & getattr(stat, "SF_DATALESS", 0x40000000):
                        skip("cloud_placeholder")
                    elif stat.S_ISDIR(item.st_mode):
                        if depth >= max_depth:
                            skip("depth_limit")
                        else:
                            stack.append((Path(entry.path), depth + 1))
                    elif stat.S_ISREG(item.st_mode):
                        identity = (item.st_dev, item.st_ino)
                        if identity in seen:
                            result["hardlink_duplicates"] += 1
                            continue
                        seen.add(identity)
                        result["regular_files_observed"] += 1
                        result["logical_bytes_observed"] += item.st_size
                        blocks = getattr(item, "st_blocks", None)
                        if blocks is None:
                            result["allocated_bytes_known"] = False
                        else:
                            result["allocated_bytes_observed"] += blocks * 512
                    else:
                        skip("special_file")
        except OSError:
            skip("unreadable")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--directory", action="append", required=True)
    parser.add_argument("--max-entries", type=int, default=500)
    parser.add_argument("--max-depth", type=int, default=1)
    parser.add_argument("--max-seconds", type=float, default=3)
    args = parser.parse_args()
    try:
        result = inventory(args.root, args.directory, args.max_entries, args.max_depth, args.max_seconds)
    except (OSError, ValueError) as exc:
        print(json.dumps({"schema_version": 1, "complete": False, "state": "refused",
                          "error_type": type(exc).__name__, "bytes": None}))
        return 75
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["complete"] else 75


if __name__ == "__main__":
    raise SystemExit(main())

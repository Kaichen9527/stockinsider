# Bounded metadata inventory

Start with filesystem free space and the next known output directory. Do not call recursive `du`, whole-tree Git status or hashes across a cloud-backed/partial source tree. In a partial recovery or placeholder/sparse workspace, remain with identity/explicit known resident files; do not run this scanner on its root or Data/media trees.

The optional `scripts/bounded_inventory.py` scans only explicitly selected existing subdirectories of one root. It reads directory entries and file metadata, never file contents, rejects observed symlinks/paths outside the root and skips other devices and known cloud-placeholder flags. It defaults to 500 entries, depth 1, 3 seconds and at most 8 selected directories; accepted limits cannot exceed 5,000 entries, depth 4 or 10 seconds. Its output contains aggregate counters, not discovered filenames or file contents. Use it only after writers have stopped: it is not a security sandbox against concurrent path replacement.

```sh
python3 "$STORAGE_SKILL/scripts/bounded_inventory.py" \
  --root "$PROJECT_ROOT" --directory log/build --directory .run \
  --max-entries 500 --max-depth 1 --max-seconds 3
```

Replace the selected relative directories with paths established from this project's rules. The root itself, `.git`, `..`, symlink roots and common cloud-storage paths are refused. Never use it to scan unknown entire user directories. A refused/missing path is UNKNOWN, not zero bytes.

`logical_bytes_observed` is summed file sizes; `allocated_bytes_observed` uses allocation metadata when available. These are **observed lower bounds**, never an estimate of total reclaimable bytes. Hard-linked regular files are counted once within a scan. Depth, entry/time limits, unreadable paths, placeholders, symlinks and volume crossings mark the result incomplete. Even a complete result is metadata inventory, not permission to delete.

The deadline is checked between filesystem calls. A blocked filesystem syscall may exceed it; on risky/missing/network mounts use the project's real external deadline controller and stop after one bounded diagnostic. Do not invent a hard OS timeout guarantee for this scanner. It cannot identify every cloud provider, prove hydration is impossible, verify recoverability, stop live writers or classify unique assets. Do not scan cloud-backed or uncertain residency paths without establishing that the selected directories are safe and already local.

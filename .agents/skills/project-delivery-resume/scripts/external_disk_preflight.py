#!/usr/bin/env python3
"""Read-only Mac external-workspace identity and reserve check. Never creates or moves files."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import platform
import plistlib
import shutil
import sys

from delivery_preflight import probe


def inspect_workspace(workspace, mount, expected_uuid, external_reserve, internal_reserve,
                      internal_root="/System/Volumes/Data"):
    errors = []
    result = {"schema_version": 1, "observed_at": datetime.now(timezone.utc).isoformat(),
              "read_only": True, "execution_approved": False, "actual_write_tested": False,
              "errors": errors, "gate": "blocked"}
    if platform.system() != "Darwin":
        errors.append("requires_mac_diskutil; do not infer a Mac mount from a remote host")
        return result
    try:
        requested_mount = Path(mount).expanduser()
        root = Path(workspace).expanduser().resolve(strict=True)
        volume = requested_mount.resolve(strict=True)
        internal = Path(internal_root).expanduser().resolve(strict=True)
        result.update(workspace=str(root), mount=str(volume), internal_root=str(internal))
        if requested_mount.is_symlink() or not volume.is_dir() or not os.path.ismount(volume):
            errors.append("external_mount_missing_or_redirected")
            return result
        if not root.is_dir() or not root.is_relative_to(volume):
            errors.append("resolved_workspace_outside_external_volume")
            return result
        if root.stat().st_dev != volume.stat().st_dev:
            errors.append("workspace_on_different_nested_filesystem")
            return result
        info = probe(["diskutil", "info", "-plist", str(volume)], str(volume))
        if info["state"] != "ok":
            errors.append("diskutil_" + info["state"])
            return result
        data = plistlib.loads(info["stdout"])
        if not isinstance(data, dict):
            raise ValueError("invalid diskutil result")
        observed_uuid = data.get("VolumeUUID")
        observed_mount = data.get("MountPoint")
        filesystem = data.get("FilesystemType")
        writable = data.get("Writable")
        if not isinstance(writable, bool) and isinstance(data.get("ReadOnlyVolume"), bool):
            writable = not data["ReadOnlyVolume"]
        result["volume"] = {"uuid": observed_uuid, "filesystem": filesystem,
                            "internal": data.get("Internal"), "writable_reported": writable}
        if not isinstance(observed_uuid, str) or observed_uuid.casefold() != expected_uuid.casefold():
            errors.append("volume_uuid_mismatch_or_unknown")
        if not isinstance(observed_mount, str) or Path(observed_mount).resolve() != volume:
            errors.append("diskutil_mount_mismatch_or_unknown")
        if data.get("Internal") is not False:
            errors.append("external_identity_not_confirmed")
        if not isinstance(filesystem, str) or filesystem.lower() != "apfs":
            errors.append("apfs_development_filesystem_not_confirmed")
        if writable is not True or data.get("ReadOnlyMedia") is True:
            errors.append("volume_writable_not_confirmed")
        if not os.access(root, os.W_OK | os.X_OK):
            errors.append("workspace_access_check_failed")
        if volume.stat().st_dev == internal.stat().st_dev:
            errors.append("external_and_internal_are_same_filesystem")
        for key, path, reserve in (("external_disk", root, external_reserve),
                                   ("internal_disk", internal, internal_reserve)):
            usage = shutil.disk_usage(path)
            result[key] = {"free_bytes": usage.free, "total_bytes": usage.total,
                           "required_free_bytes": reserve}
            if usage.free < reserve:
                errors.append(key + "_below_reserve")
    except (OSError, ValueError, plistlib.InvalidFileException) as exc:
        errors.append("probe_unavailable:" + type(exc).__name__)
    result["gate"] = "pass" if not errors else "blocked"
    result["note"] = ("Point-in-time read-only check; actual writes, project scope/owner, "
                      "toolchain and peak estimates still need verification. Recheck before each batch; "
                      "this is not a continuous unplug watchdog.")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, help="Existing selected checkout or work directory")
    parser.add_argument("--mount", required=True, help="Existing actually mounted external volume")
    parser.add_argument("--expected-volume-uuid", required=True)
    parser.add_argument("--minimum-external-free-bytes", required=True, type=int)
    parser.add_argument("--minimum-internal-free-bytes", required=True, type=int)
    args = parser.parse_args()
    if (not args.expected_volume_uuid.strip() or args.minimum_external_free_bytes < 0
            or args.minimum_internal_free_bytes < 0):
        parser.error("use an observed UUID and nonnegative actual project reserve values")
    result = inspect_workspace(args.workspace, args.mount, args.expected_volume_uuid,
                               args.minimum_external_free_bytes, args.minimum_internal_free_bytes)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["gate"] == "pass" else 75


if __name__ == "__main__":
    sys.exit(main())

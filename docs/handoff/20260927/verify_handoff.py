#!/usr/bin/env python3
"""Read-only handoff integrity check, NOT deployment admission or financial parsing."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

HERE = Path(__file__).resolve().parent
SOURCE = "54a45ef7095d61e928b7e23bcd0d8961a505acee"
TREE = "b70674b657f9e2242d0ca538b77c22169cd94f5c"
BASE = "169aad1b6cfa747f78ae3464b614f43c0749d806"
STUDY = "c3522eac9ec9f5712ae094c3864b1da50664e829"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def parse(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate JSON key")
            result[key] = value
        return result
    def invalid(_):
        raise ValueError("non-finite JSON")
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid)


def relative(name):
    require(isinstance(name, str) and "\\" not in name, "invalid relative path")
    p = PurePosixPath(name)
    require(not p.is_absolute() and ".." not in p.parts and p.parts, "escaping relative path")
    return p


def check_regular(path, size, digest):
    require(type(size) is int and 0 <= size <= 160 * 1024 * 1024, "invalid file size")
    require(isinstance(digest, str) and re.fullmatch("[0-9a-f]{64}", digest), "invalid SHA256")
    require(path.is_file() and not path.is_symlink(), "missing or non-regular file: " + path.name)
    require(path.stat().st_size == size, "size mismatch: " + path.name)
    raw = path.read_bytes()
    require(sha(raw) == digest, "SHA256 mismatch: " + path.name)
    return raw


def run(include_local=False):
    inventory = parse((HERE / "inventory.json").read_bytes())
    require(inventory["schema"] == "stockinsider-handoff-file-inventory-v1", "inventory schema")
    for name, info in inventory["files"].items():
        part = relative(name)
        check_regular(HERE.parents[2].joinpath(*part.parts), info["bytes"], info["sha256"])
    manifest = parse((HERE / "assets-manifest.json").read_bytes())
    require(manifest["schema"] == "stockinsider-handoff-assets-v1", "asset schema")
    rows = manifest["assets"]
    require(len(rows) == 8 and len({row["file"] for row in rows}) == 8, "asset inventory mismatch")
    protected = []
    study_count = 0
    for row in rows:
        part = relative(row["file"])
        path = HERE.joinpath(*part.parts)
        check_regular(path, row["bytes"], row["sha256"])
        with zipfile.ZipFile(path) as z:
            members = z.infolist()
            require(len(members) == row["archive_members"], "ZIP member count")
            require(len({m.filename for m in members}) == len(members), "duplicate ZIP member")
            require(sum(m.file_size for m in members) <= 150 * 1024 * 1024, "ZIP size limit")
            for member in members:
                relative(member.filename)
                require(stat.S_IFMT(member.external_attr >> 16) != stat.S_IFLNK, "ZIP symlink")
                if not member.is_dir():
                    z.read(member)  # CRC check only; never extract or execute.
            if path.name.startswith("protected-"):
                require(len(members) == 1, "protected envelope shape")
                envelope = parse(z.read(members[0]))
                require(envelope["issuer"] == "stockinsider-v3-gate-root", "issuer mismatch")
                require(envelope["subjectCommitSha"] == SOURCE and envelope["subjectTreeSha"] == TREE, "source mismatch")
                require(envelope["attestation"]["baseCommitSha"] == BASE, "base mismatch")
                result = envelope["result"]
                require(result["status"] == "pass", "original gate did not pass")
                require(result["commitSha"] == SOURCE and result["treeSha"] == TREE, "result source mismatch")
                # These retained four result objects contain only the JSON values
                # whose canonical encoding is matched by this serialization.
                canonical = json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
                require(sha(canonical) == envelope["resultSha256"], "original result hash mismatch")
                protected.append(result["check"])
                if result["check"] == "product-runtime-code-gate":
                    require(result["registeredCount"] == result["executedCount"] == 272, "runtime count")
            if path.name == "study-31path-complete.zip":
                original = parse(z.read("file-sha256.json"))
                require(len(original) == 49, "original study inventory count")
                for name, digest in original.items():
                    relative(name)
                    require(sha(z.read(name)) == digest, "original study member hash: " + name)
                summary = parse(z.read("summary.json"))
                require(summary["source_commit"] == STUDY, "historical study identity")
                require(summary["completed_paths"] == 31 and summary["canonical_R1_paths_passed"] == 15, "study counts")
                require(summary["R2_passed"] == 5 and summary["R2_check_count"] == 8, "statistical failures not preserved")
                study_count = len(original)
    require(set(protected) == {"requirements", "architecture", "exact-review", "product-runtime-code-gate"}, "protected evidence set")
    local_count = 0
    if include_local:
        record = parse((HERE / "local-inputs.json").read_bytes())
        require(record["directory"] == "~/Documents/StockInsider-Research-Inputs/20260927-q2-220-captured", "local input root")
        local = Path(record["directory"]).expanduser()
        require(local.is_dir() and not local.is_symlink(), "local input directory unavailable")
        for row in record["files"]:
            part = relative(row["name"])
            require(len(part.parts) == 1, "local input must be a direct file")
            check_regular(local / row["name"], row["bytes"], row["sha256"])
            local_count += 1
    return {"status": "handoff_bytes_verified", "mirrored_assets": len(rows),
            "original_protected_leaves": sorted(protected), "original_study_files_verified": study_count,
            "local_files_verified": local_count, "new_research_executed": False,
            "financial_validation_executed": False, "deployment_admitted": False,
            "note": "Integrity only; original evidence expiry/provenance and current GitHub checks still govern deployment."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local-inputs", action="store_true", help="Hash the five explicitly listed files on this authorized Mac; never parse financial statements.")
    args = parser.parse_args()
    try:
        result = run(args.local_inputs)
    except (ValueError, OSError, KeyError, TypeError, zipfile.BadZipFile) as exc:
        print(json.dumps({"status": "handoff_integrity_failed", "error": str(exc), "deployment_admitted": False}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

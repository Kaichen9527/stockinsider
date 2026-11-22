#!/usr/bin/env python3
"""Preview/apply an integrity-checked project kit. Never overwrites conflicts or pushes Git."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import os
import stat
import subprocess
import sys
import tempfile

BEGIN = "<!-- project-delivery-resume:v6:begin -->"
END = "<!-- project-delivery-resume:v6:end -->"
ENTRY = """\n<!-- project-delivery-resume:v6:begin -->
## Project delivery continuation
Use `.agents/skills/project-delivery-resume/SKILL.md` and its selected project profile.
Apply `.agents/skills/project-storage-guard/SKILL.md` before heavy output or storage recovery.
Read the existing authoritative tracker/current-state entry first. Preserve applicable
product, data and release rules. New/resume/change/triage/closeout follows the recorded user decision.
Codex and Antigravity share the .agents skill; use the actual client's tools and host capabilities.
The delivery kit is workflow support, not a replacement task tracker or a daemon.
<!-- project-delivery-resume:v6:end -->\n"""
CLAUDE_ENTRY = """\n<!-- project-delivery-resume:v6:begin -->
## Project delivery continuation
Read `AGENTS.md` and `.agents/skills/project-delivery-resume/SKILL.md`.
Use the existing authoritative tracker/current state and this project's profile.
The project skills are available through `.claude/skills/project-delivery-resume`
and `.claude/skills/project-storage-guard`; preserve their shared execution controls.
<!-- project-delivery-resume:v6:end -->\n"""


def sha(data):
    return hashlib.sha256(data).hexdigest()


def local_path(root, rel, allow_leaf_symlink=False):
    """Reject redirects at every existing component, including in-repo symlinks."""
    if not isinstance(rel, str) or not rel or "\0" in rel or "\\" in rel:
        raise ValueError("invalid payload path")
    p = PurePosixPath(rel)
    if p.is_absolute() or ".." in p.parts or p.as_posix() != rel or rel == ".":
        raise ValueError("invalid payload path")
    if root.is_symlink() or (root.exists() and not root.is_dir()):
        raise ValueError("kit/project root is not a plain directory")
    current = root
    for index, part in enumerate(p.parts):
        current = current / part
        leaf = index == len(p.parts) - 1
        if current.is_symlink() and not (leaf and allow_leaf_symlink):
            raise ValueError("path follows a symlink: " + rel)
        if not leaf and current.exists() and not current.is_dir():
            raise ValueError("path parent is not a directory: " + rel)
    return current


def safe_destination(root, rel):
    dest = local_path(root, rel)
    if not (rel.startswith(".agents/skills/project-delivery-resume/")
            or rel.startswith(".agents/skills/project-storage-guard/")
            or rel.startswith("docs/delivery-v6/")):
        raise ValueError("payload path outside allowed kit locations")
    return dest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    kit = Path(__file__).resolve().parent
    root = Path(args.project_root).resolve()
    if not root.is_dir():
        parser.error("project root does not exist")
    written, mutation_started = [], False
    try:
        git_env = os.environ.copy()
        for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE",
                    "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"):
            git_env.pop(key, None)
        git_env.update(GIT_OPTIONAL_LOCKS="0", GIT_TERMINAL_PROMPT="0", GIT_NO_LAZY_FETCH="1")
        git = subprocess.run(["git", "--no-optional-locks", "-c", "core.fsmonitor=false",
                              "rev-parse", "--show-toplevel"], cwd=root,
                             stdin=subprocess.DEVNULL, capture_output=True, env=git_env,
                             timeout=8, check=False)
        if git.returncode or Path(git.stdout.decode().strip()).resolve() != root:
            parser.error("target must be the root of the intended existing Git worktree; initialize/verify the correct private remote separately")
        if (kit / "manifest.json").is_symlink():
            raise ValueError("manifest must not be a symlink")
        manifest = json.loads((kit / "manifest.json").read_text())
        if (not isinstance(manifest, dict) or manifest.get("schema_version") != 1
                or not isinstance(manifest.get("project"), str) or not manifest["project"].strip()
                or not isinstance(manifest.get("files"), list) or not manifest["files"]):
            raise ValueError("unsupported manifest")
        actions, identical, conflicts, seen = [], [], [], set()
        for item in manifest["files"]:
            if not isinstance(item, dict):
                raise ValueError("invalid manifest entry")
            rel = item["path"]
            source = safe_destination(kit / "payload", rel)
            if rel in seen:
                raise ValueError("duplicate manifest path: " + rel)
            seen.add(rel)
            if not source.is_file() or source.is_symlink():
                raise ValueError("missing or symlinked payload")
            data = source.read_bytes()
            if sha(data) != item["sha256"]:
                raise ValueError("payload integrity mismatch: " + rel)
            dest = safe_destination(root, rel)
            if dest.exists():
                if dest.is_file() and dest.read_bytes() == data:
                    identical.append(rel)
                else:
                    conflicts.append(rel)
            else:
                actions.append((rel, dest, data, None, 0o644))
        for skill_name in ("project-delivery-resume", "project-storage-guard"):
            if f".agents/skills/{skill_name}/SKILL.md" not in seen:
                raise ValueError("manifest must include both v6 project skills")
        for name, entry in (("AGENTS.md", ENTRY), ("CLAUDE.md", CLAUDE_ENTRY)):
            dest = local_path(root, name, allow_leaf_symlink=True)
            if dest.is_symlink() or (dest.exists() and not dest.is_file()):
                conflicts.append(name)
                continue
            previous = dest.read_bytes() if dest.exists() else None
            existing = previous or b""
            block = entry.strip().encode("utf-8")
            if (b"<!-- project-delivery-resume:" in existing
                    and BEGIN.encode() not in existing):
                conflicts.append(name + " (older managed version; reconcile a reviewed Git diff)")
                continue
            if BEGIN.encode() in existing or END.encode() in existing:
                if (existing.count(BEGIN.encode()) == 1 and existing.count(END.encode()) == 1
                        and block in existing):
                    identical.append(name)
                else:
                    conflicts.append(name + " (existing managed block differs)")
            else:
                separator = b"\n" if existing and not existing.endswith(b"\n") else b""
                data = existing + separator + entry.encode("utf-8")
                mode = stat.S_IMODE(dest.stat().st_mode) if previous is not None else 0o644
                actions.append((name, dest, data, previous, mode))
        links = []
        for skill_name in ("project-delivery-resume", "project-storage-guard"):
            rel = f".claude/skills/{skill_name}"
            link = local_path(root, rel, allow_leaf_symlink=True)
            target = f"../../.agents/skills/{skill_name}"
            make_link = not link.exists() and not link.is_symlink()
            links.append((rel, link, target, make_link))
            if not make_link:
                if link.is_symlink() and os.readlink(link) == target:
                    identical.append(rel)
                else:
                    conflicts.append(rel)
        report = {"project": manifest["project"], "mode": "apply" if args.apply else "preview",
                  "copy_or_append": [a[0] for a in actions], "already_identical": identical,
                  "create_relative_claude_link": links[0][3],
                  "create_relative_claude_links": [rel for rel, _, _, create in links if create],
                  "conflicts": conflicts,
                  "git_push_performed": False, "agent_started": False}
        if conflicts:
            report["status"] = "blocked_no_changes"
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 3
        if args.apply:
            for rel, dest, data, previous, mode in actions:
                # Recheck before each write; never replace an unexpectedly appeared file.
                local_path(root, rel)
                if ((previous is None and dest.exists()) or
                        (previous is not None and (not dest.is_file() or dest.read_bytes() != previous))):
                    raise ValueError("target changed since preview: " + rel)
                mutation_started = True
                dest.parent.mkdir(parents=True, exist_ok=True)
                fd, temporary = tempfile.mkstemp(prefix=".delivery-install-", dir=dest.parent)
                try:
                    with os.fdopen(fd, "wb") as handle:
                        handle.write(data)
                    os.chmod(temporary, mode)
                    if previous is None:
                        os.link(temporary, dest)
                    else:
                        os.replace(temporary, dest)
                    written.append(rel)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
            for rel, link, target, make_link in links:
                if make_link:
                    local_path(root, rel)
                    mutation_started = True
                    link.parent.mkdir(parents=True, exist_ok=True)
                    link.symlink_to(target, target_is_directory=True)
                    written.append(rel)
            for item in manifest["files"]:
                if sha(safe_destination(root, item["path"]).read_bytes()) != item["sha256"]:
                    raise ValueError("post-install integrity mismatch")
            report["status"] = "applied_local_only"
        else:
            report["status"] = "preview_no_changes"
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, KeyError, TypeError, OSError, subprocess.TimeoutExpired, UnicodeError) as exc:
        print(json.dumps({"status": "failed", "error": str(exc), "changes_completed": written,
                          "target_may_be_partially_updated": mutation_started,
                          "git_push_performed": False, "agent_started": False}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())

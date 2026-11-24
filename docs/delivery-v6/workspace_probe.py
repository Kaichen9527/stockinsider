#!/usr/bin/env python3
"""Read one explicit worktree's identity; never register, claim, scan or modify it."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
from urllib.parse import urlsplit, urlunsplit

DEADLINE_SECONDS = 4
OUTPUT_LIMIT = 65536


def run(argv, cwd=None, env=None):
    try:
        result = subprocess.run(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                capture_output=True, timeout=DEADLINE_SECONDS, check=False)
    except subprocess.TimeoutExpired:
        return None, "timeout"
    except (OSError, ValueError):
        return None, "unavailable"
    if len(result.stdout) > OUTPUT_LIMIT or len(result.stderr) > OUTPUT_LIMIT:
        return None, "output_limit"
    if result.returncode and b"not a git repository" in result.stderr.lower():
        return None, "not_git"
    if result.returncode:
        return None, "command_failed"
    try:
        return result.stdout.decode("utf-8").strip(), "observed"
    except UnicodeError:
        return None, "non_utf8"


def host_identity(explicit):
    if explicit:
        if not re.fullmatch(r"[A-Za-z0-9._-]{3,120}", explicit):
            raise ValueError("host-id must use 3–120 letters, digits, dot, underscore or hyphen")
        return explicit, "explicit_existing_host_id"
    raw, source = None, "unknown"
    if platform.system() == "Darwin":
        output, status = run(["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"])
        if output is not None:
            match = re.search(r'"IOPlatformUUID"\s*=\s*"([^"\r\n]+)"', output)
            if match:
                raw, source = match.group(1).strip(), "mac_IOPlatformUUID_sha256"
        if raw is None:
            source = "mac_identity_" + status
    elif platform.system() == "Linux":
        try:
            raw = Path("/etc/machine-id").read_text(encoding="ascii").strip()
            if not re.fullmatch(r"[0-9a-fA-F]{32}", raw):
                raw = None
            else:
                source = "linux_machine_id_sha256"
        except (OSError, UnicodeError):
            pass
    if not raw:
        return None, source
    return "host-" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24], source


def clean_origin(value):
    """Remove credentials/query/fragment; normalize standard GitHub SSH/HTTPS origins."""
    if not value or any(c in value for c in "\r\n\0"):
        return None
    scp = re.fullmatch(r"(?:[^/@:]+@)?([^/:]+):([^\s]+)", value)
    if scp and "://" not in value:
        host, path = scp.group(1).lower(), scp.group(2)
        if host == "github.com":
            path = path.removesuffix(".git").strip("/")
            if re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", path):
                return "https://github.com/" + path
        return None
    parsed = urlsplit(value)
    if parsed.scheme not in ("https", "http", "ssh") or not parsed.hostname:
        return None
    host = parsed.hostname.lower()
    path = parsed.path.removesuffix(".git").rstrip("/")
    if host == "github.com":
        if not re.fullmatch(r"/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", path):
            return None
        return "https://github.com" + path
    port = ":" + str(parsed.port) if parsed.port else ""
    return urlunsplit((parsed.scheme, host + port, path, "", ""))


def probe(args):
    root = Path(args.root).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError("root must be an existing directory")
    host_id, host_source = host_identity(args.host_id)
    observation = {
        "schemaVersion": 1, "observedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "projectId": args.project_id, "label": args.label, "requestedRoot": str(root),
        "hostId": host_id, "hostIdentitySource": host_source,
        "subprocessDeadlineSeconds": DEADLINE_SECONDS,
        "dirtyState": "not_checked", "processOwnership": "not_checked",
        "registrationPerformed": False, "leaseAcquired": False, "watcherInstalled": False,
    }
    env = os.environ.copy()
    for name in ("GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE",
                 "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"):
        env.pop(name, None)
    env.update(GIT_OPTIONAL_LOCKS="0", GIT_TERMINAL_PROMPT="0", GIT_NO_LAZY_FETCH="1", LC_ALL="C")
    prefix = ["git", "--no-optional-locks", "-c", "core.fsmonitor=false"]
    def git(*argv):
        return run(prefix + list(argv), cwd=root, env=env)
    top, status = git("rev-parse", "--show-toplevel")
    if top is None:
        observation.update(capability="not_git" if status == "not_git" else "unknown",
                           gitProbeStatus=status)
        if status == "not_git" and args.allow_non_git and host_id:
            payload = {"id": "ws-" + hashlib.sha256((host_id + "\0" + str(root)).encode()).hexdigest()[:24],
                       "projectId": args.project_id, "label": args.label, "hostId": host_id,
                       "canonicalPath": str(root), "commonGitDir": "", "repoUrl": ""}
            observation.update(canonicalPath=str(root), commonGitDir="", repoUrl="",
                               sourceBackup="unconfirmed_not_git")
            return {"observation": observation, "registerWorkspace": payload,
                    "nextAction": "Register only if the actual service schema supports confirmed non-Git workspaces; preserve unique source before product work."}
        return {"observation": observation, "registerWorkspace": None,
                "nextAction": "Check the intended existing repository; do not invent repo or ownership."}
    canonical = Path(top).resolve(strict=True)
    observation["canonicalPath"] = str(canonical)
    if canonical != root:
        observation.update(capability="root_is_subdirectory")
        return {"observation": observation, "registerWorkspace": None,
                "nextAction": "Rerun with --root set to the observed worktree root."}
    common, common_status = git("rev-parse", "--git-common-dir")
    branch, branch_status = git("symbolic-ref", "--quiet", "--short", "HEAD")
    head, head_status = git("rev-parse", "--verify", "HEAD")
    origin, origin_status = git("config", "--get", "remote.origin.url")
    clean = clean_origin(origin)
    common_path = str((root / common).resolve(strict=True)) if common else None
    observation.update(commonGitDir=common_path, branch=branch,
                       head=head if head and re.fullmatch(r"[0-9a-f]{40,64}", head) else None,
                       repoUrl=clean, gitProbeStatus="observed",
                       branchStatus=branch_status, headStatus=head_status,
                       commonGitDirStatus=common_status, originStatus=origin_status)
    if clean and not clean.startswith("https://github.com/"):
        observation["capability"] = "unsupported_remote_for_current_site"
        return {"observation": observation, "registerWorkspace": None,
                "nextAction": "The current Site accepts GitHub repository URLs only; do not invent or replace this repository's remote."}
    if not (host_id and common_path and clean):
        observation["capability"] = "identity_incomplete"
        return {"observation": observation, "registerWorkspace": None,
                "nextAction": "Resolve the missing stable host ID, common Git directory or clean remote URL."}
    workspace_id = "ws-" + hashlib.sha256((host_id + "\0" + str(canonical)).encode()).hexdigest()[:24]
    payload = {"id": workspace_id, "projectId": args.project_id, "label": args.label,
               "hostId": host_id, "canonicalPath": str(canonical),
               "commonGitDir": common_path, "repoUrl": clean}
    if branch:
        payload["branch"] = branch
    observation["capability"] = "git_identity_observed"
    return {"observation": observation, "registerWorkspace": payload,
            "nextAction": "Read existing workspace coordination; reconcile aliases; register using the current tool schema, then verify old writers before claiming."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--host-id", help="Reuse an existing registered stable host identity when known")
    parser.add_argument("--allow-non-git", action="store_true",
                        help="Emit an empty-repository descriptor only after Git explicitly reports not a repository")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,120}", args.project_id):
        parser.error("invalid project-id")
    if not args.label.strip() or len(args.label) > 100:
        parser.error("label must contain 1–100 characters")
    try:
        result = probe(args)
    except (OSError, ValueError, UnicodeError):
        result = {"observation": {"capability": "unknown", "registrationPerformed": False,
                                  "leaseAcquired": False, "watcherInstalled": False},
                  "registerWorkspace": None, "error": "Could not read the explicit workspace identity safely."}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["registerWorkspace"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

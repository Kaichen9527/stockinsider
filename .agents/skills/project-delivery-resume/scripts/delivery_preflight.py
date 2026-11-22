#!/usr/bin/env python3
"""Bounded, read-only project/host inventory. Does not start or approve work."""
import argparse
import json
import os
from pathlib import Path
import platform
import selectors
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone

PROBE_SECONDS = 8
PROBE_OUTPUT_BYTES = 1024 * 1024
GIT = ["git", "--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false"]


def probe(argv, cwd, seconds=PROBE_SECONDS, max_output_bytes=PROBE_OUTPUT_BYTES):
    """Bound subprocess time and combined output; incomplete output is never usable."""
    process = None
    selector = selectors.DefaultSelector()
    stdout, total, stderr_bytes = bytearray(), 0, 0
    state, error = "ok", None
    env = os.environ.copy()
    # Inspect the supplied directory, not an inherited override for another repo.
    for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE",
                "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"):
        env.pop(key, None)
    env.update(GIT_OPTIONAL_LOCKS="0", GIT_TERMINAL_PROMPT="0")
    try:
        process = subprocess.Popen(argv, cwd=cwd, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   env=env, start_new_session=os.name == "posix")
        selector.register(process.stdout, selectors.EVENT_READ, "stdout")
        selector.register(process.stderr, selectors.EVENT_READ, "stderr")
        deadline = time.monotonic() + seconds
        while selector.get_map() and state == "ok":
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                state = "timeout"
                break
            for key, _ in selector.select(remaining):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                total += len(chunk)
                if total > max_output_bytes:
                    state = "output_limit"
                    break
                if key.data == "stdout":
                    stdout.extend(chunk)
                else:
                    stderr_bytes += len(chunk)
        if state == "ok":
            process.wait(timeout=max(0.001, deadline - time.monotonic()))
            if process.returncode:
                state = "failed"
    except subprocess.TimeoutExpired:
        state = "timeout"
    except (OSError, ValueError) as exc:
        state, error = "unavailable", type(exc).__name__
    finally:
        selector.close()
        if process is not None:
            if state in ("timeout", "output_limit", "unavailable"):
                try:
                    if os.name == "posix":
                        os.killpg(process.pid, signal.SIGKILL)
                    else:
                        process.kill()
                except OSError:
                    pass
            for stream in (process.stdout, process.stderr):
                if stream is not None:
                    stream.close()
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                state = "timeout"
    result = {"state": state, "exit_code": process.returncode if process is not None else None,
              "stdout": bytes(stdout) if state in ("ok", "failed") else b"",
              "stderr_bytes": stderr_bytes}
    if error:
        result["error"] = error
    return result


def status_counts(data):
    if data and not data.endswith(b"\0"):
        raise ValueError("incomplete porcelain output")
    parts = data.split(b"\0")
    entries, untracked, i = 0, 0, 0
    while i < len(parts) - 1:
        part = parts[i]
        if len(part) < 4 or part[2:3] != b" " or any(c not in b" MTADRCU?!" for c in part[:2]):
            raise ValueError("invalid porcelain entry")
        entries += 1
        untracked += part.startswith(b"?? ")
        if b"R" in part[:2] or b"C" in part[:2]:
            i += 1
            if i >= len(parts) - 1 or not parts[i]:
                raise ValueError("incomplete rename/copy entry")
        i += 1
    return {"status_entries": entries, "untracked_entries": untracked,
            "tracked_entries": entries - untracked, "worktree_clean": entries == 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--root", default=".")
    parser.add_argument("--required-free-bytes", required=True, type=int,
                        help="Actual phase reserve, including estimated new peak, from project policy")
    args = parser.parse_args()
    if args.required_free_bytes < 0 or not args.project.strip():
        parser.error("project must be nonempty; reserve must be nonnegative")
    root = Path(args.root).resolve()
    if not root.is_dir():
        parser.error("root must be an existing directory")
    disk = {"free_bytes": None, "total_bytes": None,
            "required_free_bytes": args.required_free_bytes, "state": "unavailable", "gate": "unknown"}
    try:
        usage = shutil.disk_usage(root)
        disk.update(free_bytes=usage.free, total_bytes=usage.total, state="ok",
                    gate="pass" if usage.free >= args.required_free_bytes else "blocked")
    except OSError as exc:
        disk["error"] = type(exc).__name__
    unknown_status = {"status_entries": None, "untracked_entries": None,
                      "tracked_entries": None, "worktree_clean": None}
    result = {
        "schema_version": 1, "project": args.project,
        "observed_at": datetime.now(timezone.utc).isoformat(), "requested_root": str(root),
        "system": platform.system(), "architecture": platform.machine(), "disk": disk,
        "probe_limits": {"seconds_each": PROBE_SECONDS, "output_bytes_each": PROBE_OUTPUT_BYTES,
                         "max_git_probes": 5},
        "tools": {name: shutil.which(name) is not None for name in
                  ("git", "python3", "node", "pnpm", "java", "docker", "adb",
                   "emulator", "xcodebuild", "codex", "claude", "gh")},
        "git": {"state": "unavailable", "worktree_confirmed": False, **unknown_status},
        "execution_approved": False,
        "note": "Read-only inventory; scope confirmation, live owner, auth, capabilities and peak estimate still require verification."
    }
    if result["tools"]["git"]:
        worktree = probe(GIT + ["rev-parse", "--show-toplevel"], root)
        if worktree["state"] != "ok":
            result["git"]["state"] = worktree["state"]
        else:
            observed_root = worktree["stdout"].decode("utf-8", "replace").strip()
            git_state = {"state": "ok", "worktree_confirmed": bool(observed_root),
                         "worktree_root": observed_root, **unknown_status}
            if not observed_root or Path(observed_root).resolve() != root:
                git_state["state"] = "root_mismatch"
            else:
                for key, cmd in (("head", ["rev-parse", "HEAD"]),
                                 ("branch", ["rev-parse", "--abbrev-ref", "HEAD"])):
                    item = probe(GIT + cmd, root)
                    git_state[key] = (item["stdout"].decode("utf-8", "replace").strip()
                                      if item["state"] == "ok" else None)
                    git_state[key + "_state"] = item["state"]
                    if item["state"] != "ok" or not git_state[key]:
                        git_state["state"] = "incomplete"
                status = probe(GIT + ["status", "--porcelain=v1", "-z", "--untracked-files=normal"], root)
                git_state["status_state"] = status["state"]
                if status["state"] == "ok":
                    try:
                        git_state.update(status_counts(status["stdout"]))
                    except ValueError:
                        git_state["status_state"] = "invalid_output"
                if git_state["status_state"] != "ok":
                    git_state["state"] = "incomplete"
                remote = probe(GIT + ["config", "--get", "remote.origin.url"], root)
                if remote["state"] == "ok":
                    git_state["origin_configured"] = bool(remote["stdout"].strip())
                    git_state["origin_state"] = "ok"
                elif (remote["state"] == "failed" and remote["exit_code"] == 1
                      and not remote["stdout"] and not remote["stderr_bytes"]):
                    git_state["origin_configured"] = False
                    git_state["origin_state"] = "not_configured"
                else:
                    git_state["origin_configured"] = None
                    git_state["origin_state"] = remote["state"]
                    git_state["state"] = "incomplete"
                git_state["remote_readback_verified"] = False
            result["git"] = git_state
    result["preflight_gate"] = "pass" if disk["gate"] == "pass" and result["git"]["state"] == "ok" else "blocked"
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["preflight_gate"] == "pass" else 75


if __name__ == "__main__":
    sys.exit(main())

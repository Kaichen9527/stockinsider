#!/usr/bin/env python3
"""Run one foreground command with persistent attempt and resource limits.

Python standard library only; macOS/Linux. Share a durable state directory
across projects on one host. This is a command guard, not an acceptance test,
a sandbox, a cross-host coordinator, or a token/spend governor. It deletes no
logs or artifacts and cannot stop an existing Codex Goal or unowned process.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import queue
import selectors
import shutil
import signal
import subprocess
import sys
import threading
import time

SCHEMA_VERSION = 2
MAX_LEDGER_BYTES = 2 * 1024 * 1024
GIB = 1024 ** 3
MIB = 1024 ** 2
POLL_SECONDS = 0.05
STOP_GRACE_SECONDS = 1.0
_requested_signal = 0


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def emit(value):
    print(json.dumps(value, ensure_ascii=False, sort_keys=True), flush=True)


def atomic_json(path, value):
    # One reusable staging name, under the exclusive state lock. No cleanup
    # command or recursive deletion is provided by this program.
    staging = path.with_name(path.name + ".next")
    encoded = (json.dumps(value, ensure_ascii=False, sort_keys=True,
                          indent=2) + "\n").encode("utf-8")
    if path.name == "ledger.json" and len(encoded) > MAX_LEDGER_BYTES:
        raise ValueError("ledger capacity exceeded")
    fd = os.open(staging, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(staging, path)
    directory_fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def on_signal(signum, _frame):
    global _requested_signal
    _requested_signal = signum


def group_exists(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def signal_owned_group(pgid, signum):
    try:
        os.killpg(pgid, signum)
        return True
    except ProcessLookupError:
        return False


def nearest_existing(path):
    while not path.exists():
        if path == path.parent:
            break
        path = path.parent
    return path


def minimum_free(paths):
    return min(shutil.disk_usage(nearest_existing(p)).free for p in paths)


def validate_ledger(ledger):
    """Reject corrupt/incomplete state; never infer an empty attempt history."""
    if not isinstance(ledger, dict) or ledger.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("unsupported ledger schema; inspect before migrating")
    if not isinstance(ledger.get("checks"), dict):
        raise ValueError("invalid checks")
    for key, check in ledger["checks"].items():
        if not isinstance(check, dict):
            raise ValueError("invalid check")
        ids = [check.get(field) for field in ("project_id", "task_id", "check_id")]
        if any(not isinstance(value, str) or not value.strip() for value in ids):
            raise ValueError("invalid check identity")
        if key != digest("\0".join(ids)):
            raise ValueError("check identity mismatch")
        limit, runs = check.get("max_attempts"), check.get("runs")
        if type(limit) is not int or limit < 1 or not isinstance(runs, list) or len(runs) > limit:
            raise ValueError("invalid attempt history")
        for attempt, run in enumerate(runs, 1):
            if not isinstance(run, dict) or run.get("schema_version") != SCHEMA_VERSION:
                raise ValueError("invalid run")
            if [run.get(field) for field in ("project_id", "task_id", "check_id")] != ids:
                raise ValueError("run identity mismatch")
            if type(run.get("attempt")) is not int or run["attempt"] != attempt or run.get("status") not in (
                    "STARTING", "RUNNING", "PASS", "FAIL", "BLOCKED"):
                raise ValueError("invalid run state")
            for field in ("input_sha256", "command_sha256"):
                value = run.get(field)
                if not isinstance(value, str) or len(value) != 64 or any(
                        char not in "0123456789abcdef" for char in value):
                    raise ValueError("invalid run identity hash")
            if run["status"] in ("PASS", "FAIL", "BLOCKED"):
                for field in ("reason", "finished_at", "captured_log_sha256", "log_path",
                              "captured_log_bytes", "child_exit_code",
                              "owned_group_present_at_return", "retention_review_after"):
                    if field not in run:
                        raise ValueError("incomplete exit proof")
                if type(run["owned_group_present_at_return"]) is not bool:
                    raise ValueError("invalid group state")
                if type(run["captured_log_bytes"]) is not int or run["captured_log_bytes"] < 0:
                    raise ValueError("invalid captured log size")
                log_hash = run["captured_log_sha256"]
                if not isinstance(log_hash, str) or len(log_hash) != 64 or any(
                        char not in "0123456789abcdef" for char in log_hash):
                    raise ValueError("invalid captured log hash")
                if not isinstance(run["log_path"], str) or not run["log_path"]:
                    raise ValueError("invalid log path")
                if run["child_exit_code"] is not None and type(run["child_exit_code"]) is not int:
                    raise ValueError("invalid exit code")
                if run["status"] == "PASS" and (run["child_exit_code"] != 0 or
                                                 run["owned_group_present_at_return"]):
                    raise ValueError("invalid pass proof")
                stamp = dt.datetime.fromisoformat(run["retention_review_after"])
                if stamp.tzinfo is None:
                    raise ValueError("missing retention timezone")


class ArtifactWatch:
    """Bound traversal work; a stalled filesystem scan never blocks the runner.

    This counts logical regular-file sizes inside one directory, without
    following symlinks. It is sampling, not a filesystem quota.
    """
    def __init__(self, root):
        self.root = root
        self.pending_since = None
        self.answers = queue.Queue(maxsize=1)
        self.last_bytes = 0
        self.last_scan_started = float("-inf")

    def _scan(self):
        started = time.monotonic()
        total = 0
        entries = 0
        stack = [self.root]
        try:
            while stack:
                with os.scandir(stack.pop()) as listing:
                    for entry in listing:
                        entries += 1
                        if entries > 5000 or time.monotonic() - started > 0.2:
                            self.answers.put(("ARTIFACT_SCAN_BUDGET", total))
                            return
                        if entry.is_symlink():
                            continue
                        if entry.is_dir(follow_symlinks=False):
                            stack.append(entry.path)
                        elif entry.is_file(follow_symlinks=False):
                            total += entry.stat(follow_symlinks=False).st_size
            self.answers.put((None, total))
        except OSError:
            self.answers.put(("ARTIFACT_SCAN_ERROR", total))

    def poll(self, now, final_after=None):
        if self.pending_since is not None:
            try:
                problem, size = self.answers.get_nowait()
                self.last_scan_started = self.pending_since
                self.pending_since = None
                self.last_bytes = size
                if problem:
                    return problem
            except queue.Empty:
                if now - self.pending_since > 0.75:
                    return "ARTIFACT_SCAN_TIMEOUT"
                return None
        if final_after is None or self.last_scan_started < final_after:
            self.pending_since = now
            threading.Thread(target=self._scan, daemon=True).start()
        return None


def execute(args, command, run_dir, ledger, key, record, ledger_path, disk_paths):
    global _requested_signal
    _requested_signal = 0
    log_path = run_dir / "output.log"
    record["log_path"] = str(log_path)
    previous_handlers = {}
    for sig in (signal.SIGINT, signal.SIGTERM):
        previous_handlers[sig] = signal.signal(sig, on_signal)
    proc = None
    sel = selectors.DefaultSelector()
    log_hash = hashlib.sha256()
    log_bytes = 0
    reason = None
    stop_at = None
    first_exit_at = None
    eof = False
    group_signal_sent = False
    kill_signal_sent = False
    watcher = ArtifactWatch(args.watch_dir) if args.watch_dir else None
    started = time.monotonic()
    last_disk_check = started
    try:
        # stdin cannot wait for a password or an interactive confirmation.
        proc = subprocess.Popen(command, cwd=args.cwd, shell=False,
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, start_new_session=True)
        record.update(status="RUNNING", pid=proc.pid, started_at=utc_now())
        atomic_json(ledger_path, ledger)
        os.set_blocking(proc.stdout.fileno(), False)
        sel.register(proc.stdout, selectors.EVENT_READ)
        log_fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(log_fd, "wb") as output:
            while True:
                now = time.monotonic()
                for event, _ in sel.select(POLL_SECONDS):
                    try:
                        chunk = os.read(event.fd, 65536)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        eof = True
                        sel.unregister(event.fileobj)
                        continue
                    remaining = args.max_log_bytes - log_bytes
                    kept = chunk[:max(0, remaining)]
                    if kept:
                        output.write(kept)
                        log_hash.update(kept)
                        log_bytes += len(kept)
                    if len(chunk) >= remaining and reason is None:
                        reason = "LOG_LIMIT"
                now = time.monotonic()
                if reason is None and _requested_signal:
                    reason = "INTERRUPTED"
                if reason is None and now - started >= args.timeout_seconds:
                    reason = "TIMEOUT"
                if reason is None and now - last_disk_check >= 0.25:
                    last_disk_check = now
                    if minimum_free(disk_paths) < args.min_free_bytes:
                        reason = "LOW_DISK"
                child_exit = proc.poll()
                if child_exit is not None:
                    first_exit_at = first_exit_at or now
                if reason is None and watcher:
                    problem = watcher.poll(now, final_after=first_exit_at)
                    if problem:
                        reason = problem
                    elif watcher.last_bytes > args.max_artifact_bytes:
                        reason = "ARTIFACT_LIMIT"
                if child_exit is not None:
                    alive = group_exists(proc.pid)
                    if reason is None and now - first_exit_at >= 0.25:
                        if alive:
                            reason = "BACKGROUND_CHILDREN"
                        elif not eof:
                            reason = "DETACHED_OUTPUT_OWNER"
                    # Wait for one final artifact scan after command completion.
                    scan_pending = watcher and watcher.pending_since is not None
                    if reason is None and not alive and eof and not scan_pending:
                        break
                if reason is not None and stop_at is None:
                    stop_at = now
                    sig = _requested_signal or signal.SIGTERM
                    group_signal_sent = signal_owned_group(proc.pid, sig)
                if stop_at is not None:
                    if now - stop_at >= STOP_GRACE_SECONDS and not kill_signal_sent:
                        kill_signal_sent = signal_owned_group(proc.pid, signal.SIGKILL)
                    if child_exit is not None and eof and not group_exists(proc.pid):
                        break
                    # Do not wait indefinitely for inherited pipes or zombies.
                    if now - stop_at >= STOP_GRACE_SECONDS + 0.5:
                        break
            output.flush()
            os.fsync(output.fileno())
        if proc.poll() is None:
            signal_owned_group(proc.pid, signal.SIGKILL)
            try:
                proc.wait(timeout=0.25)
            except subprocess.TimeoutExpired:
                reason = reason or "PROCESS_DID_NOT_EXIT"
        child_exit = proc.poll()
        status = "PASS" if reason is None and child_exit == 0 else (
            "FAIL" if reason is None else "BLOCKED")
        record.update(status=status, reason=reason or (
            "EXIT_ZERO" if child_exit == 0 else "EXIT_NONZERO"),
            child_exit_code=child_exit, finished_at=utc_now(),
            elapsed_seconds=round(time.monotonic() - started, 3),
            captured_log_bytes=log_bytes, captured_log_sha256=log_hash.hexdigest(),
            watched_artifact_bytes=watcher.last_bytes if watcher else None,
            termination_signal_sent=group_signal_sent,
            kill_signal_sent=kill_signal_sent,
            owned_group_present_at_return=group_exists(proc.pid),
            retention_review_after=(dt.datetime.now(dt.timezone.utc) +
                dt.timedelta(hours=args.evidence_ttl_hours)).isoformat(timespec="seconds"))
        atomic_json(run_dir / "result.json", record)
        atomic_json(ledger_path, ledger)
        emit(record)
        if _requested_signal:
            return 128 + _requested_signal
        return 0 if status == "PASS" else (1 if status == "FAIL" else 75)
    except OSError as exc:
        if proc is None:
            # A normal launch failure is not a genuinely started attempt.
            ledger["checks"][key]["runs"].pop()
            atomic_json(ledger_path, ledger)
            emit({"status": "BLOCKED", "reason": "LAUNCH_FAILED",
                  "errno": exc.errno, "timestamp": utc_now(),
                  "attempt_consumed": False})
            return 75
        raise
    finally:
        if proc is not None:
            # Only this invocation's new process group is addressed. Detached
            # daemons that create another session are outside this boundary.
            if proc.poll() is None or group_exists(proc.pid):
                signal_owned_group(proc.pid, signal.SIGTERM)
                signal_owned_group(proc.pid, signal.SIGKILL)
            if proc.stdout is not None:
                proc.stdout.close()
        sel.close()
        for sig, handler in previous_handlers.items():
            signal.signal(sig, handler)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--cwd", required=True, type=Path)
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--check-id", required=True)
    parser.add_argument("--input-id", required=True,
                        help="Caller-provided commit+dirty snapshot+env/test identity")
    parser.add_argument("--change-note", default="")
    parser.add_argument("--timeout-seconds", type=float, default=900)
    disk_floor = parser.add_mutually_exclusive_group(required=True)
    disk_floor.add_argument("--min-free-gib", type=float,
                            help="Use the project's approved minimum free GiB")
    disk_floor.add_argument("--min-free-bytes", type=int,
                            help="Exact-byte floor when the project defines GB, not GiB")
    parser.add_argument("--max-attempts", type=int, default=2,
                        help="Pinned on first launch for this project/task/check")
    parser.add_argument("--evidence-ttl-hours", type=float, default=72,
                        help="Retention review marker only; nothing is deleted")
    parser.add_argument("--max-log-mib", type=float, default=16)
    parser.add_argument("--watch-dir", type=Path)
    parser.add_argument("--max-artifact-mib", type=float, default=512)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("provide the command and arguments after --")
    for field in ("project_id", "task_id", "check_id", "input_id"):
        value = getattr(args, field)
        if not value.strip() or len(value) > 2048:
            parser.error(field + " must be nonempty and at most 2048 characters")
    if not (0 < args.timeout_seconds < float("inf")):
        parser.error("timeout must be finite and positive")
    if args.min_free_gib is not None and not (0 <= args.min_free_gib < float("inf")):
        parser.error("minimum free space must be finite and nonnegative")
    if args.min_free_bytes is not None and args.min_free_bytes < 0:
        parser.error("minimum free bytes must be nonnegative")
    if args.max_attempts < 1:
        parser.error("max attempts must be positive")
    if not (0 < args.evidence_ttl_hours <= 876000):
        parser.error("evidence TTL hours must be positive and at most 100 years")
    if not (0 < args.max_log_mib < float("inf")):
        parser.error("log limit must be finite and positive")
    if not (0 < args.max_artifact_mib < float("inf")):
        parser.error("artifact limit must be finite and positive")
    args.max_log_bytes = max(1, int(args.max_log_mib * MIB))
    args.max_artifact_bytes = max(1, int(args.max_artifact_mib * MIB))
    if args.min_free_gib is not None:
        args.min_free_bytes = int(args.min_free_gib * GIB)
    args.state_dir = args.state_dir.expanduser().resolve()
    args.cwd = args.cwd.expanduser().resolve()
    if args.watch_dir:
        args.watch_dir = args.watch_dir.expanduser().resolve()
    args.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_fd = os.open(args.state_dir / "heavy-command.lock", os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            emit({"status": "BLOCKED", "reason": "STATE_BUSY",
                  "timestamp": utc_now(), "attempt_consumed": False})
            return 75
        ledger_path = args.state_dir / "ledger.json"
        if ledger_path.with_name("ledger.json.next").exists():
            raise ValueError("unfinished state write; manual reconciliation required")
        if ledger_path.exists():
            if ledger_path.stat().st_size > MAX_LEDGER_BYTES:
                raise ValueError("ledger capacity exceeded")
            ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
            validate_ledger(ledger)
        else:
            runs_root = args.state_dir / "runs"
            if runs_root.exists() and any(runs_root.iterdir()):
                raise ValueError("missing ledger with existing run evidence")
            ledger = {"schema_version": SCHEMA_VERSION, "checks": {}}
        key = digest(args.project_id + "\0" + args.task_id + "\0" + args.check_id)
        input_hash = digest(args.input_id)
        command_hash = digest("\0".join(command))
        entry = ledger["checks"].get(key, {
            "project_id": args.project_id, "task_id": args.task_id,
            "check_id": args.check_id, "max_attempts": args.max_attempts, "runs": []})
        runs = entry["runs"]

        def block(reason):
            emit({"status": "BLOCKED", "reason": reason,
                  "project_id": args.project_id,
                  "task_id": args.task_id, "check_id": args.check_id,
                  "timestamp": utc_now(), "attempt_consumed": False,
                  "attempts_started_or_reserved": len(runs)})
            return 75

        # A killed wrapper releases flock, but its command may still be alive.
        # Refuse all heavy work in this state directory until that old run is
        # reviewed, even if the new caller asks for a different task/check.
        if any(r["status"] in ("STARTING", "RUNNING") or
               r.get("owned_group_present_at_return", False)
               for check in ledger["checks"].values() for r in check["runs"]):
            return block("UNRESOLVED_PRIOR_RUN")
        if entry["max_attempts"] != args.max_attempts:
            return block("ATTEMPT_POLICY_MISMATCH")
        for run in runs:
            if run["input_sha256"] == input_hash:
                if run["command_sha256"] != command_hash:
                    return block("INPUT_COMMAND_MISMATCH")
                if run["status"] == "PASS":
                    cached = dict(run, reused=True, observed_at=utc_now(),
                                  retention_review_due=dt.datetime.now(dt.timezone.utc) >=
                                  dt.datetime.fromisoformat(run["retention_review_after"]))
                    emit(cached)
                    return 0
                return block("UNCHANGED_FAILED_INPUT")
        if len(runs) >= entry["max_attempts"]:
            return block("ATTEMPT_BUDGET_EXHAUSTED")
        if runs and not args.change_note.strip():
            return block("CHANGE_NOTE_REQUIRED")
        if not args.cwd.is_dir():
            return block("CWD_NOT_DIRECTORY")
        disk_paths = [args.cwd, args.state_dir]
        if args.watch_dir:
            # Require a fresh/empty output location, not an entire repo/cache.
            if args.watch_dir == args.cwd or args.watch_dir in args.cwd.parents:
                return block("WATCH_DIR_IS_PROJECT_ANCESTOR")
            if args.watch_dir == args.state_dir or args.watch_dir in args.state_dir.parents:
                return block("WATCH_DIR_CONTAINS_STATE")
            if args.watch_dir.exists():
                if not args.watch_dir.is_dir():
                    return block("WATCH_DIR_NOT_DIRECTORY")
                with os.scandir(args.watch_dir) as listing:
                    if next(listing, None) is not None:
                        return block("WATCH_DIR_NOT_EMPTY")
            disk_paths.append(args.watch_dir)
        if minimum_free(disk_paths) < args.min_free_bytes:
            return block("LOW_DISK_PREFLIGHT")
        # Reserve durably before spawning. A normal Popen failure rolls back;
        # a crash in this narrow window fails closed as an unresolved run.
        record = {"schema_version": SCHEMA_VERSION, "project_id": args.project_id,
                  "task_id": args.task_id,
                  "check_id": args.check_id, "input_sha256": input_hash,
                  "command_sha256": command_hash,
                  "command": Path(command[0]).name[:128],
                  "change_note_sha256": digest(args.change_note) if args.change_note else None,
                  "attempt": len(runs) + 1, "status": "STARTING",
                  "created_at": utc_now(), "reused": False,
                  "limits": {"timeout_seconds": args.timeout_seconds,
                             "min_free_bytes": args.min_free_bytes,
                             "max_log_bytes": args.max_log_bytes,
                             "max_artifact_bytes": args.max_artifact_bytes,
                             "max_attempts": args.max_attempts,
                             "evidence_ttl_hours": args.evidence_ttl_hours}}
        runs.append(record)
        ledger["checks"][key] = entry
        atomic_json(ledger_path, ledger)
        run_dir = args.state_dir / "runs" / key / ("attempt-" + str(record["attempt"]))
        # An earlier ordinary launch failure may have left this empty directory.
        run_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        if args.watch_dir:
            args.watch_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        return execute(args, command, run_dir, ledger, key, record, ledger_path, disk_paths)
    finally:
        os.close(lock_fd)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as exc:
        # Do not export argv, exception text, or raw logs: they may contain tokens.
        emit({"status": "BLOCKED", "reason": "RUNNER_STATE_OR_IO_ERROR",
              "error_type": type(exc).__name__, "timestamp": utc_now(),
              "instruction": "Inspect the local ledger and owned processes; no automatic reset."})
        sys.exit(75)

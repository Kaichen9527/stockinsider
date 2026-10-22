#!/usr/bin/env python3
"""Publish finite TAP names/status/counts, keeping assertion row dumps private.
This only formats evidence; the caller must preserve the actual test exit code.
"""
import pathlib
import re
import sys

source, destination = map(pathlib.Path, sys.argv[1:])
if source.is_symlink() or not source.is_file() or source.stat().st_size > 8 * 1024 * 1024:
    raise SystemExit("bounded regular TAP input required")
allowed = re.compile(r"^\s*(?:TAP version 13|# Subtest: |(?:not )?ok \d+ - |1\.\.\d+|# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)")
lines = [line for line in source.read_text().splitlines() if allowed.match(line)]
if not any(line.startswith("# tests ") for line in lines):
    lines.append("# evidence_incomplete: no final TAP test count observed")
value = "\n".join(lines) + "\n"
destination.write_text(value)
sys.stdout.write(value)

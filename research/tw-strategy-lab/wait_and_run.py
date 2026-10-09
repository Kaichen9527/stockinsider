#!/usr/bin/env python3
"""Bounded local continuation; run once after the downloader seals its manifest.

This never downloads, changes strategies, touches production, or commits/pushes.
An hourly Chat task reviews the resulting artifacts and updates the draft PR.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import json
from pathlib import Path
import subprocess
import sys
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True, help='Existing official raw cache for final current-parser validation')
    parser.add_argument('--max-wait-minutes', type=int, default=120)
    args = parser.parse_args()
    if not 1 <= args.max_wait_minutes <= 180:
        parser.error('wait bound must be 1–180 minutes')
    root = Path(__file__).resolve().parent
    status = root / 'results' / 'job-status.json'
    status.parent.mkdir(exist_ok=True)
    with (root / 'results' / 'continuation.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error('another local continuation is running')
        deadline = time.monotonic() + args.max_wait_minutes * 60
        def checkpoint(state, **fields):
            record = dict(state=state, observed_at=datetime.now(timezone.utc).isoformat(),
                          output=str(args.output), **fields)
            temporary = status.with_suffix('.tmp')
            temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
            temporary.replace(status)
            print(json.dumps(record, ensure_ascii=False), flush=True)
        while time.monotonic() < deadline:
            if (args.output / 'results.json').exists():
                checkpoint('already_complete_no_repeat')
                return 0
            try:
                manifest = json.loads((args.data / 'manifest.json').read_bytes())
            except (OSError, ValueError):
                manifest = {}
            if manifest.get('download_complete'):
                validated = subprocess.run([sys.executable, str(root / 'official_data.py'), '--normalize-only',
                                             '--cache', str(args.cache), '--output', str(args.data)], timeout=180)
                current = json.loads((args.data / 'manifest.json').read_bytes()) if validated.returncode == 0 else {}
                if not current.get('download_complete'):
                    checkpoint('final_source_validation_blocked', return_code=validated.returncode)
                    return 2
                checkpoint('running_frozen_research', available_requests=manifest.get('available_requests'))
                completed = subprocess.run([sys.executable, str(root / 'run_research.py'), '--data', str(args.data), '--output', str(args.output)], timeout=900)
                checkpoint('complete' if completed.returncode == 0 else 'failed_requires_review', return_code=completed.returncode)
                return completed.returncode
            checkpoint('waiting_for_official_data', available_requests=manifest.get('available_requests', 0),
                       expected_requests=manifest.get('expected_requests'))
            time.sleep(30)
        checkpoint('timed_out_data_incomplete')
        return 2


if __name__ == '__main__':
    raise SystemExit(main())

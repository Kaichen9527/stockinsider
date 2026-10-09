"""Recover the frozen replay bundle only from byte-identical normalized tables.

No network or simulation. New retrieval provenance is retained separately; the
old manifest is copied only after every original table hash/size matches.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASELINE = ROOT / 'results/github-36081668572-1'
DATASET_SHA256 = 'a89bf8e5cbcfc464463a53c29f1f5f68f6419d72f2a06befcaeb008e3cff5cca'
TABLES = ('prices.csv', 'benchmark.csv', 'corporate_actions.csv')
MAX_BYTES = 32 * 1024 * 1024


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def strict_json(raw):
    def pairs(rows):
        out = {}
        for key, value in rows:
            if key in out:
                raise ValueError('duplicate_json_key')
            out[key] = value
        return out
    def nonfinite(_):
        raise ValueError('nonfinite_json')
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=nonfinite)


def read_bytes(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError('input_not_regular_file:' + path.name)
    with path.open('rb') as stream:
        raw = stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('input_size_bound:' + path.name)
    return raw


def check_tables(directory, manifest):
    """Return inspectable mismatches; never edit hashes or repair rows to match."""
    blobs, checks = {}, []
    if manifest.get('holdout_accessed') is not False or manifest.get('requested_session_range') != ['2018-01-01', '2023-12-31']:
        raise ValueError('frozen_manifest_scope_invalid')
    for name in TABLES:
        expected = manifest.get('outputs', {}).get(name, {})
        try:
            raw = read_bytes(Path(directory) / name)
            actual = digest(raw)
            match = actual == expected.get('sha256') and len(raw) == expected.get('bytes')
            rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8')))) if match else []
            if match and any(not isinstance(row.get('session'), str) or not '2018-01-01' <= row['session'] < '2024-01-01' for row in rows):
                raise ValueError('replay_table_outside_frozen_period')
            if match:
                blobs[name] = raw
            checks.append({'file': name, 'status': 'exact' if match else 'mismatch',
                           'expected_sha256': expected.get('sha256'), 'actual_sha256': actual,
                           'expected_bytes': expected.get('bytes'), 'actual_bytes': len(raw)})
        except (ValueError, OSError, UnicodeError) as exc:
            checks.append({'file': name, 'status': 'unavailable', 'error_class': type(exc).__name__})
    return blobs, checks


def recover(directory, output, *, baseline=BASELINE, dataset_sha256=DATASET_SHA256):
    output = Path(output)
    if output.exists() or output.is_symlink():
        raise ValueError('output_already_exists')
    original = read_bytes(Path(baseline) / 'dataset-manifest.json')
    if digest(original) != dataset_sha256:
        raise ValueError('frozen_manifest_hash_mismatch')
    manifest = strict_json(original)
    blobs, checks = check_tables(directory, manifest)
    later = Path(directory) / 'manifest.json'
    later_bytes = read_bytes(later) if later.is_file() else None
    recovered = len(blobs) == len(TABLES)
    receipt = {'schema': 'tw-replay-input-recovery-v1', 'dataset_sha256': dataset_sha256,
               'status': 'exact_tables_recovered' if recovered else 'blocked_table_mismatch_or_missing',
               'tables': checks, 'later_manifest_sha256': digest(later_bytes) if later_bytes else None,
               'new_historical_simulations': 0, 'holdout_accessed': False,
               'original_source_timestamps_not_reassigned': True,
               'network_requests_by_recovery': 0,
               'note': 'Byte equality restores normalized replay inputs, not missing historical PIT authority.'}
    output.mkdir(parents=True, exist_ok=False)
    (output / 'recovery.json').write_text(json.dumps(receipt, indent=2, allow_nan=False) + '\n')
    if later_bytes is not None:
        (output / 'later-acquisition-manifest.json').write_bytes(later_bytes)
    if recovered:
        for name, raw in blobs.items():
            (output / name).write_bytes(raw)
        (output / 'manifest.json').write_bytes(original)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(recover(args.candidate, args.output), indent=2))


if __name__ == '__main__':
    main()

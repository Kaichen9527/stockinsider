"""Reproduce research-only drafts from the frozen, compact 176-card CSV.

This is a derived identity projection, NOT the original HTTP observation or a
current authoritative snapshot. No network, database, trading or publication.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import article_builder

HERE = Path(__file__).resolve().parent
CSV_PATH = HERE / 'sources/public-roster-20260925T134939Z.csv'
CSV_SHA256 = '1e24943467ac3053b4e163027b916f66f6fda79e0c73355055559e672791d853'
ORIGINAL_OBSERVATION_SHA256 = '672a721579f5098cdc1be946c82b5592579d15b7afa037734ad570305aa60124'
RESEARCH = HERE / 'results/github-36081668572-1/results.json'


def snapshot_from_csv(raw: bytes) -> dict:
    if hashlib.sha256(raw).hexdigest() != CSV_SHA256:
        raise ValueError('frozen_public_roster_hash_mismatch')
    rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8'))))
    if len(rows) != 176 or len({r['symbol'] for r in rows}) != 176:
        raise ValueError('frozen_public_roster_cardinality_mismatch')
    candidates = [{'symbol': r['symbol'], 'name': r['name'],
                   'revision': r['public_detail_revision'] or None,
                   'revision_scope': 'public_card_only_not_database_authority',
                   'observed_surfaces': r['surfaces'].split('|'),
                   'observed_at': None} for r in rows]
    return {'schema_version': 'public-roster-derived-csv-v1',
            'scope': 'bounded_public_card_observation_only',
            'as_of': '2026-09-25T13:49:39.217683+00:00',
            'source_content_as_of': '2026-09-12',
            'snapshot_published_at': '2026-09-25T15:27:18.599+02:00',
            'complete': False, 'expected_count': 176,
            'authoritative_snapshot_available': False,
            'full_app_coverage_verified': False,
            'public_stage_coverage_complete': True,
            'transport_authenticated': False,
            'derived_from_csv_sha256': CSV_SHA256,
            'original_observation_sha256': ORIGINAL_OBSERVATION_SHA256,
            'per_card_observation_times_omitted': True,
            'candidates': candidates}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args(argv)
    snapshot = snapshot_from_csv(CSV_PATH.read_bytes())
    # Exclusive new directory; never follow/replace an existing output leaf.
    args.output_dir.mkdir(parents=True, exist_ok=False)
    path = args.output_dir / 'derived-snapshot.json'
    with path.open('x', encoding='utf-8') as stream:
        stream.write(json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    return article_builder.main(['--snapshot', str(path), '--research', str(RESEARCH),
                                 '--output-dir', str(args.output_dir / 'drafts')])


if __name__ == '__main__':
    main()

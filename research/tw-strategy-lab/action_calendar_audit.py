"""Inspect exact recovered inputs without generating a signal or simulation.

Dates adjacent in a benchmark are observations, NOT approval to shift an event.
A missing recorded session may mean closure, truncation, or an input error.
"""
from bisect import bisect_left
from datetime import date
from pathlib import Path
import argparse
import json
from replay_inputs import DATASET_SHA256, read_bytes, strict_json, digest, check_tables
from run_research import load_dataset, canonical


def load_frozen_dataset(directory):
    path = Path(directory)
    raw = read_bytes(path / 'manifest.json')
    if digest(raw) != DATASET_SHA256:
        raise ValueError('exact_frozen_manifest_required')
    blobs, checks = check_tables(path, strict_json(raw))
    if len(blobs) != 3 or any(row['status'] != 'exact' for row in checks):
        raise ValueError('exact_frozen_tables_required')
    values = load_dataset(path)
    if values[1] != DATASET_SHA256 or read_bytes(path / 'manifest.json') != raw:
        raise ValueError('frozen_input_changed_during_inspection')
    return values, checks


def inspect_actions(actions, sessions):
    if not isinstance(sessions, list) or any(not isinstance(s, str) for s in sessions):
        raise ValueError('invalid_calendar')
    if sessions != sorted(set(sessions)):
        raise ValueError('invalid_calendar')
    for session in sessions:
        if date.fromisoformat(session).isoformat() != session or not '2018-01-01' <= session < '2024-01-01':
            raise ValueError('calendar_scope_invalid')
    if not isinstance(actions, dict):
        raise ValueError('invalid_actions')
    problems, events = [], 0
    for symbol, rows in sorted(actions.items()):
        if not isinstance(rows, list):
            raise ValueError('invalid_actions')
        seen = set()
        for event in rows:
            if not isinstance(event, dict):
                raise ValueError('invalid_action')
            session = event.get('session')
            if not isinstance(session, str) or date.fromisoformat(session).isoformat() != session:
                raise ValueError('invalid_action_session')
            if not '2018-01-01' <= session < '2024-01-01':
                raise ValueError('action_scope_invalid')
            events += 1
            kind = 'duplicate_action_session' if session in seen else None
            seen.add(session)
            index = bisect_left(sessions, session)
            if index == len(sessions) or sessions[index] != session:
                kind = 'action_not_on_calendar' if kind is None else kind + ':action_not_on_calendar'
            if kind:
                problems.append(dict(symbol=symbol, reported_session=session, reason=kind,
                    previous_recorded_session=sessions[index-1] if index else None,
                    next_recorded_session=sessions[index] if index < len(sessions) else None,
                    source_sha256=event.get('source_sha256'), automatic_correction=False))
    return dict(status='consistent' if not problems else 'blocked_input_inconsistency',
                included_symbol_count=len(actions), inspected_events=events, issues=problems,
                new_simulations=0, historical_signals_generated=0, input_modified=False)


def inspect(directory):
    (_, dataset, _, actions, benchmark, exclusions), checks = load_frozen_dataset(directory)
    result = inspect_actions(actions, sorted(benchmark))
    return dict(result, schema='frozen-action-calendar-audit-v1', dataset_sha256=dataset,
                table_checks=checks, exclusions=exclusions,
                warning='Neighboring recorded dates are not an inferred effective ex-date or permission to replace frozen evidence.')


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args=parser.parse_args(argv)
    result=inspect(args.data)
    with args.output.open('xb') as stream:
        stream.write(canonical(result)+b'\n')
    print(json.dumps({'status': result['status'], 'issue_count':len(result['issues']), 'new_simulations':0}))
    return 0 if result['status']=='consistent' else 2

if __name__=='__main__':
    raise SystemExit(main())

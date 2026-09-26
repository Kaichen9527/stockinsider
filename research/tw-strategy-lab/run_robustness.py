"""Finite v2.1 implementation: default inspect, independently reviewed execution only.

31 registered paths, no parameter search, production IO or holdout. The GitHub
contract review is NOT the repository's protected release/model-host gate.
"""
from __future__ import annotations
import argparse
from dataclasses import replace
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import statistics
import subprocess
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from engine import Assumptions, simulate
from strategies import generate_signals
from run_research import load_dataset, window_statistics, canonical
from replay_inputs import BASELINE, DATASET_SHA256, digest, read_bytes, strict_json

ROOT = Path(__file__).resolve().parent
PROPOSAL = ROOT / 'proposals/robustness-study-v2.1.json'
PROPOSAL_SHA256 = '4379960b4d1406bee97fcf54fa0f99e832abdefa1ed9a5111d04f2d25748270a'
CLARIFICATION = ROOT / 'proposals/robustness-study-v2.1-clarification-1.json'
CLARIFICATION_SHA256 = 'f44e230f54a13251c51c6919aea7e78088d7ecc6508bb51a3c4a2a88e430d8af'
BASELINE_FILES = ROOT / 'proposals/robustness-baseline-files-v1.json'
BASELINE_FILES_SHA256 = '3313c139c0d972a263933eb970fa5dd40caf6cc660bd4d1f1284ebb359b87c04'
STRATEGIES = ('S1', 'S2', 'S3', 'S4', 'S6')
SCENARIOS = {'baseline': Assumptions(),
             'cost_stress': replace(Assumptions(), commission=.00285, minimum_commission=40, slippage_bps=20),
             'small_capacity': replace(Assumptions(), initial_cash=1_000_000)}
VARIANTS = ('S4v2-070', 'S4v2-075')
DIVIDENDS = ('payment_date_unknown', 'optimistic_next_session_preopen')
LEDGER_KEYS = ('strategy_id', 'scenario', 'parameter_variant', 'status', 'metrics', 'result_file')


def contract():
    raw = read_bytes(PROPOSAL)
    if digest(raw) != PROPOSAL_SHA256:
        raise ValueError('proposal_hash_mismatch')
    proposal = strict_json(raw)
    clarification = read_bytes(CLARIFICATION)
    if digest(clarification) != CLARIFICATION_SHA256:
        raise ValueError('clarification_hash_mismatch')
    proposal['metric_contract']['profit_factor']['all_zero_or_no_trades'] = None
    proposal['clarification_sha256'] = CLARIFICATION_SHA256
    return proposal


def baseline_bundle(directory=BASELINE):
    raw = read_bytes(BASELINE_FILES)
    if digest(raw) != BASELINE_FILES_SHA256:
        raise ValueError('baseline_hash_inventory_changed')
    values = {}
    for name, expected in strict_json(raw).items():
        if Path(name).name != name:
            raise ValueError('baseline_path_invalid')
        content = read_bytes(Path(directory) / name)
        if digest(content) != expected:
            raise ValueError('baseline_file_hash_mismatch:' + name)
        values[name] = ([strict_json(line) for line in content.splitlines() if line] if name.endswith('.jsonl') else strict_json(content))
    if values['results.json']['dataset_hash'] != DATASET_SHA256:
        raise ValueError('baseline_dataset_mismatch')
    return values


def registered_paths():
    paths = [{'work': 'R1', 'strategy_id': sid, 'scenario': scenario, 'dividend_availability': 'recorded',
              'parameter_variant': False, 'id': f'R1:{sid}:{scenario}'} for sid in STRATEGIES for scenario in SCENARIOS]
    paths += [{'work': 'R3', 'strategy_id': variant, 'scenario': scenario, 'dividend_availability': 'recorded',
               'parameter_variant': True, 'id': f'R3:{variant}:{scenario}'} for variant in VARIANTS for scenario in SCENARIOS]
    paths += [{'work': 'R4', 'strategy_id': sid, 'scenario': 'baseline', 'dividend_availability': payment,
               'parameter_variant': False, 'id': f'R4:{sid}:{payment}'} for sid in STRATEGIES for payment in DIVIDENDS]
    return paths


def number(value):
    try:
        return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)
    except OverflowError:
        return False


def trade_diagnostics(result):
    trades = result['trades']
    if not isinstance(trades, list) or any(not isinstance(t, dict) or not isinstance(t.get('symbol'), str)
            or not number(t.get('net_pnl')) or not number(t.get('net_return')) for t in trades):
        raise ValueError('invalid_completed_trades')
    positives = [t for t in trades if t['net_pnl'] > 0]
    positive = sum(t['net_pnl'] for t in positives)
    negative = -sum(t['net_pnl'] for t in trades if t['net_pnl'] < 0)
    by_symbol = {}
    for trade in positives:
        by_symbol[trade['symbol']] = by_symbol.get(trade['symbol'], 0) + trade['net_pnl']
    equity, receivables = (result['metrics'][key] for key in ('ending_equity', 'ending_receivables'))
    capital = result['assumptions']['initial_cash']
    if not all(number(value) for value in (equity, receivables, capital)):
        raise ValueError('invalid_terminal_accounting')
    return {'completed_trades': len(trades),
            'median_net_trade_return': statistics.median(t['net_return'] for t in trades) if trades else None,
            'profit_factor': positive / negative if negative > 0 else None,
            'largest_winner_share_of_positive_profit': max((t['net_pnl'] for t in positives), default=0) / positive if positive else 1,
            'largest_symbol_share_of_positive_profit': max(by_symbol.values(), default=0) / positive if positive else 1,
            'terminal_return_ex_unavailable_receivables': (equity - receivables) / capital - 1 if capital > 0 else None}


def r2_diagnostics(bundle, proposal):
    metrics, failures = {}, []
    for scenario in ('baseline', 'cost_stress'):
        try:
            result = bundle[f'S3-{scenario}.json']
            if result.get('status') != 'exploratory':
                raise ValueError('baseline_result_not_exploratory')
            metrics.update({f'{key}_{scenario}': value for key, value in trade_diagnostics(result).items()})
        except (KeyError, TypeError, ValueError, ArithmeticError) as exc:
            failures.append({'scenario': scenario, 'error_class': type(exc).__name__})
    operators = {'>': lambda a, b: a > b, '>=': lambda a, b: a >= b, '<=': lambda a, b: a <= b}
    checks = []
    for check in proposal['work_items'][1]['finite_checks']:
        value = metrics.get(check['metric'])
        checks.append({**check, 'value': value, 'passed': number(value) and operators[check['operator']](value, check['threshold'])})
    return {'status': 'diagnostic_checks_passed' if not failures and all(c['passed'] for c in checks) else 'exploratory_checks_failed',
            'checks': checks, 'failures': failures, 'new_simulations': 0, 'promotion_allowed': False,
            'interpretation': 'Result-informed development diagnostic, not out-of-sample alpha.'}


def confirmation_counts(signals):
    return {key: sum(row.get(field) == value for row in signals) for key, field, value in (
        ('raw_confirmation_count', 'raw_signal_state', 'confirmed'),
        ('eligible_order_count', 'plan_state', 'eligible_proxy'),
        ('avoid_chase_count', 'plan_state', 'avoid_chase'))}


def inspect_retained():
    proposal, bundle = contract(), baseline_bundle()
    return {'schema': 'tw-robustness-v2.1-retained-inspection', 'proposal_sha256': PROPOSAL_SHA256,
            'dataset_sha256': DATASET_SHA256, 'clarification_sha256': CLARIFICATION_SHA256, 'new_simulations': 0, 'holdout_accessed': False,
            'R1_reporting_only': {sid: confirmation_counts(bundle[f'{sid}-signals.json']) for sid in STRATEGIES},
            'R1_replay_verified': False, 'R2': r2_diagnostics(bundle, proposal),
            'registered_paths': registered_paths(), 'registered_simulation_count': 31,
            'execution_authorized': False, 'production_authorized': False}


def source_identity():
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    try:
        if git('status', '--porcelain', '--untracked-files=normal'):
            raise ValueError('dirty_research_source')
        return {'commit': git('rev-parse', 'HEAD'), 'tree': git('rev-parse', 'HEAD^{tree}')}
    except (OSError, subprocess.CalledProcessError) as exc:
        raise ValueError('clean_git_source_identity_required') from exc


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('review_redirect_rejected')


def verify_review_payload(review, commit, now=None, comment=None):
    """Native review text only; an author comment or a new head is not accepted."""
    from native_review import verify
    return verify(review, commit, PROPOSAL_SHA256, CLARIFICATION_SHA256, now, comment)


def fetch_contract_review(review_id, commit, comment_id=None):
    from native_review import fetch
    return fetch(review_id, commit, PROPOSAL_SHA256, CLARIFICATION_SHA256, comment_id)


def enrich(result, benchmark):
    first = benchmark[result['curve'][0]['date']]
    last = benchmark[result['curve'][-1]['date']]
    result['benchmark'] = dict(name='TAIEX total return index, no fees', total_return=last / first - 1,
                              exposure_matching=False, note='Fully invested index vs strategy cash allocation; not a risk-matched alpha test.')
    result['development_half_year_windows'] = window_statistics(result['curve'])
    return result


def r1_equality(sid, scenario, signals, result, bundle):
    filename = f'{sid}-{scenario}.json'
    old = [row for row in bundle['trial-ledger.jsonl'] if row['strategy_id'] == sid and row['scenario'] == scenario]
    trial = {'strategy_id': sid, 'scenario': scenario, 'parameter_variant': False,
             'status': result['status'], 'metrics': result['metrics'], 'result_file': filename}
    return {'result': canonical(result) == canonical(bundle[filename]),
            'signals': canonical(signals) == canonical(bundle[f'{sid}-signals.json']),
            'ledger': len(old) == 1 and canonical({k: old[0].get(k) for k in LEDGER_KEYS}) == canonical(trial)}


def run_registered_paths(bars, actions, benchmark, bundle, proposal, output, identity):
    """Pure execution component; callers own admission. Synthetic tests use this.

    The public CLI additionally requires exact inputs and live independent review.
    An R1 failure blocks, but does not omit, every remaining registered new trial.
    """
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    def save(name, value):
        path = output / name
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('xb') as stream:
            stream.write(canonical(value) + b'\n')
    paths = registered_paths()
    save('registered-paths.json', {'identity': identity, 'paths': paths})
    records, cached_signals, reporting = [], {}, {}
    r1_pass = True
    sessions = sorted(benchmark)
    for path in paths:
        sid, scenario, work = (path[key] for key in ('strategy_id', 'scenario', 'work'))
        record = {**path, 'status': 'blocked', 'result_file': None}
        if work != 'R1' and not r1_pass:
            record['reason'] = 'R1_canonical_replay_failed'
        else:
            try:
                signal_key = sid
                if signal_key not in cached_signals:
                    cached_signals[signal_key] = generate_signals(bars, 'S4' if work == 'R3' else sid, actions,
                        allow_reconstructed_history=True, **({'s4_variant': sid} if work == 'R3' else {}))
                    save(f'signals/{sid}.json', cached_signals[signal_key])
                signals = cached_signals[signal_key]
                result = simulate(bars, signals, sessions, start='2019-01-01', end='2023-12-31',
                                  actions_by_symbol=actions, assumptions=SCENARIOS[scenario],
                                  dividend_availability=path['dividend_availability'])
                if work == 'R1':
                    enrich(result, benchmark)
                    checks = r1_equality(sid, scenario, signals, result, bundle)
                    record['canonical_equality'] = checks
                    reporting[sid] = confirmation_counts(signals)
                    if not all(checks.values()):
                        r1_pass = False
                filename = f"{work}/{sid}-{scenario}-{path['dividend_availability']}.json"
                save(filename, result)
                record.update(result_file=filename, result_sha256=digest(canonical(result)),
                              metrics=result['metrics'], status=result['status'])
                if work == 'R1' and not all(record['canonical_equality'].values()):
                    record['status'] = 'failed_canonical_equality'
                if result['status'] != 'exploratory':
                    if work == 'R1':
                        r1_pass = False
            except (ValueError, TypeError, KeyError, ArithmeticError, AssertionError, OSError) as exc:
                record.update(status='failed', error_class=type(exc).__name__, reason=str(exc)[:256])
                if work == 'R1':
                    r1_pass = False
        records.append(record)
        with (output / 'trial-ledger.jsonl').open('ab') as stream:
            stream.write(canonical(record) + b'\n')
    outcome = {'schema': 'tw-robustness-v2.1-execution', 'identity': identity,
               'R1_canonical_replay_passed': r1_pass, 'R1_reporting': reporting,
               'R2': r2_diagnostics(bundle, proposal), 'trials': records,
               'registered_simulation_paths': 31, 'retained_path_records': len(records),
               'completed_simulation_paths': sum(r['result_file'] is not None for r in records),
               'status': 'development_only_complete' if all(r['status'] == 'exploratory' for r in records) else 'incomplete_or_failed',
               'holdout_accessed': False, 'production_authorized': False, 'winner_selected': None,
               'blocked_hypotheses': ['S5_PIT_revenue_missing', 'S7_licensed_PIT_broker_events_missing'],
               'limitations': proposal['global_decision_rules'] + ['R4 optimistic payment is an assumption, not factual payment timing.']}
    save('results.json', outcome)
    return outcome


def execute(data_directory, output, review_id, review_comment_id=None):
    proposal, bundle = contract(), baseline_bundle()
    source = source_identity()
    review = fetch_contract_review(review_id, source['commit'], review_comment_id)
    manifest, data_hash, bars, actions, benchmark, exclusions = load_dataset(data_directory)
    if data_hash != DATASET_SHA256 or sorted(bars) != proposal['scope']['universe']:
        raise ValueError('exact_replay_inputs_missing_or_universe_changed')
    identity = {'source': source, 'proposal_sha256': PROPOSAL_SHA256, 'dataset_sha256': data_hash,
                'review': review, 'clarification_sha256': CLARIFICATION_SHA256, 'observed_at': datetime.now(timezone.utc).isoformat(),
                'normalized_source_reconstructed': manifest.get('knowledge_mode', 'official_effective_date_reconstruction'), 'exclusions': exclusions}
    return run_registered_paths(bars, actions, benchmark, bundle, proposal, output, identity)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--data', type=Path)
    parser.add_argument('--review-id', type=int)
    parser.add_argument('--review-comment-id', type=int, help='Optional native inline acceptance belonging to this submitted review')
    args = parser.parse_args()
    if args.output.exists() or args.output.is_symlink():
        parser.error('output must be a new path')
    if args.execute:
        if args.data is None or args.review_id is None:
            parser.error('execution requires --data and --review-id')
        result = execute(args.data, args.output, args.review_id, args.review_comment_id)
    else:
        result = inspect_retained()
        args.output.mkdir(parents=True, exist_ok=False)
        (args.output / 'inspection.json').write_bytes(canonical(result) + b'\n')
    print(json.dumps({'status': result.get('status', 'retained_inspection_only'),
                      'new_simulations': result.get('completed_simulation_paths', 0), 'output': str(args.output)}))


if __name__ == '__main__':
    main()

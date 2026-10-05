#!/usr/bin/env python3
"""Offline audit of one retained development artifact, never strategy validation.

Only the pinned JSON/JSONL bundle is read. No network, model, simulation, source
module import, normalized data, database or submission capability is provided.
Exit 0 means the bounded derived audit ran without a discrepancy, not that an
investment strategy passed. Reports always prohibit promotion and submission.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import date, datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import statistics
import subprocess

ROOT = Path(__file__).resolve().parent
BASELINE = ROOT / 'results/github-36081668572-1'
INVENTORY = ROOT / 'proposals/robustness-baseline-files-v1.json'
INVENTORY_SHA256 = '3313c139c0d972a263933eb970fa5dd40caf6cc660bd4d1f1284ebb359b87c04'
DATASET_SHA256 = 'a89bf8e5cbcfc464463a53c29f1f5f68f6419d72f2a06befcaeb008e3cff5cca'
REGISTRY_SHA256 = 'abd03f9bbe3230575f3e14016c8c1fd92fef6ad00155c0d743612754e8bcc98d'
ORIGINAL_COMMIT = 'e1fb505a894105e05fb08aa28fd0fb8ad8e520fa'
RUN_ID = 'a9123545831d8ee1a39b231c'
PANEL = ['2330', '2317', '1216', '2882', '2603', '6488', '5347', '8069']
INCLUDED = ['1216', '2330', '5347', '6488', '8069']
STRATEGIES = ('S1', 'S2', 'S3', 'S4', 'S6')
SCENARIOS = ('baseline', 'cost_stress', 'small_capacity')
FILE_NAMES = frozenset(
    [f'{sid}-{scenario}.json' for sid in STRATEGIES for scenario in SCENARIOS]
    + [f'{sid}-signals.json' for sid in STRATEGIES]
    + ['dataset-manifest.json', 'preregistration.json', 'results.json', 'trial-ledger.jsonl'])
MAX_BYTES = 32 * 1024 * 1024
MAX_ROWS = 100_000


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False,
                      separators=(',', ':'), allow_nan=False).encode('utf-8') + b'\n'


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('duplicate_json_key')
            result[key] = value
        return result

    def reject(_):
        raise ValueError('nonfinite_json')

    def floating(value):
        result = float(value)
        if not math.isfinite(result):
            raise ValueError('nonfinite_json')
        return result

    return json.loads(raw, object_pairs_hook=pairs, parse_constant=reject, parse_float=floating)


class UnsupportedRuntime(ValueError):
    pass


def runtime_preflight():
    """Check required descriptor operations without creating any output."""
    required = (os.open, os.stat, os.mkdir)
    if (os.name != 'posix' or any(fn not in os.supports_dir_fd for fn in required)
            or os.stat not in os.supports_follow_symlinks
            or any(not getattr(os, flag, 0) for flag in ('O_NOFOLLOW', 'O_DIRECTORY', 'O_NONBLOCK'))):
        raise UnsupportedRuntime('required_descriptor_safety_unavailable')
    descriptor = child = None
    try:
        descriptor = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        child = os.open('.', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
        os.stat('.', dir_fd=child, follow_symlinks=False)
    except (OSError, NotImplementedError, TypeError, AttributeError) as error:
        raise UnsupportedRuntime('required_descriptor_safety_unavailable') from error
    finally:
        if child is not None:
            os.close(child)
        if descriptor is not None:
            os.close(descriptor)


def absolute_input(path):
    # Do not resolve symlinks or normalize away a traversal through an ancestor.
    path = Path(path)
    if '..' in path.parts:
        raise ValueError('parent_path_traversal_refused')
    return path if path.is_absolute() else Path.cwd() / path


def open_child_directory(parent, name):
    before = os.stat(name, dir_fd=parent, follow_symlinks=False)
    if not stat.S_ISDIR(before.st_mode):
        raise ValueError('input_ancestor_not_directory')
    child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK,
                    dir_fd=parent)
    try:
        opened = os.fstat(child)
        if not stat.S_ISDIR(opened.st_mode) or (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            raise ValueError('input_ancestor_replaced')
        return child
    except BaseException:
        os.close(child)
        raise


@contextmanager
def open_directory(path):
    """Pin every ancestor from root; never follow a path or replacement symlink."""
    runtime_preflight()
    path = absolute_input(path)
    descriptor = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for name in path.parts[1:]:
            child = open_child_directory(descriptor, name)
            os.close(descriptor)
            descriptor = child
        yield descriptor
    finally:
        os.close(descriptor)


def read_regular_at(name, parent):
    """Bounded relative no-follow read from an already pinned parent."""
    before = os.stat(name, dir_fd=parent, follow_symlinks=False)
    if not stat.S_ISREG(before.st_mode):
        raise ValueError('input_not_regular_file')
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    try:
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode):
            raise ValueError('input_not_regular_file')
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            raise ValueError('input_replaced')
        if opened.st_size > MAX_BYTES:
            raise ValueError('input_size_bound')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(MAX_BYTES + 1)
        after = os.fstat(fd)
        if len(raw) > MAX_BYTES:
            raise ValueError('input_size_bound')
        if (opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns) != (
                after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise ValueError('input_changed_during_read')
        return raw
    finally:
        os.close(fd)


def read_regular(path, *, dir_fd=None):
    path = Path(path)
    if dir_fd is not None:
        if path.is_absolute() or len(path.parts) != 1 or path.name in ('.', '..'):
            raise ValueError('relative_leaf_required')
        return read_regular_at(path.name, dir_fd)
    path = absolute_input(path)
    with open_directory(path.parent) as parent:
        return read_regular_at(path.name, parent)


class Checks:
    def __init__(self):
        self.rows = []

    def require(self, name, condition):
        self.rows.append({'check': name, 'status': 'verified' if condition else 'failed'})
        return bool(condition)

    def equal_number(self, name, actual, expected):
        if expected is None:
            return self.require(name, actual is None)
        return self.require(name, finite(actual) and finite(expected)
                            and math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-7))


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def session(value):
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError('invalid_session')
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value or not '2018-01-01' <= value < '2024-01-01':
        raise ValueError('session_outside_sealed_development_scope')
    return parsed


def rows(value, name):
    if not isinstance(value, list) or len(value) > MAX_ROWS or any(not isinstance(r, dict) for r in value):
        raise ValueError('invalid_or_unbounded_' + name)
    return value


def expected_assumptions(scenario):
    return {'initial_cash': 1_000_000 if scenario == 'small_capacity' else 10_000_000,
            'commission': .00285 if scenario == 'cost_stress' else .001425,
            'minimum_commission': 40 if scenario == 'cost_stress' else 20,
            'sell_tax': .003, 'slippage_bps': 20 if scenario == 'cost_stress' else 10,
            'lot': 1000, 'max_weight': .1, 'max_turnover_participation': .01}


def recompute_derived(result, signals, scenario, checks):
    """Independent arithmetic on exported observations, not market verification."""
    curve, fills, trades = (rows(result.get(k), k) for k in ('curve', 'fills', 'trades'))
    if len(curve) < 2:
        raise ValueError('insufficient_curve')
    expected = expected_assumptions(scenario)
    if not checks.require('frozen_cost_and_capital_assumptions', result.get('assumptions') == expected):
        raise ValueError('unregistered_assumptions')
    a = expected
    ordered = [row.get('date') for row in curve]
    dates = [session(value) for value in ordered]
    if ordered != sorted(set(ordered)) or ordered[0] >= '2019-01-01' or ordered[1] < '2019-01-01':
        raise ValueError('curve_chronology_invalid')
    for row in curve:
        if any(not finite(row.get(k)) for k in ('equity', 'cash', 'receivables', 'exposure')):
            raise ValueError('curve_nonfinite')
        if row['equity'] <= 0 or min(row['cash'], row['receivables'], row['exposure']) < 0 or row['exposure'] > 1:
            raise ValueError('curve_balance_invalid')
    checks.require('exported_equity_decomposition', all(math.isclose(
        row['equity'], row['cash'] + row['receivables'] + row['equity'] * row['exposure'],
        rel_tol=1e-10, abs_tol=1e-7) for row in curve))
    checks.require('initial_exported_capital', curve[0]['equity'] == a['initial_cash']
                   and curve[0]['cash'] == a['initial_cash'] and curve[0]['receivables'] == 0)

    by_signal = {}
    for row in rows(signals, 'signals'):
        session(row.get('date'))
        if row.get('symbol') not in INCLUDED:
            raise ValueError('signal_symbol_outside_frozen_panel')
        key = (row['symbol'], row['date'])
        if key in by_signal:
            raise ValueError('duplicate_signal')
        by_signal[key] = row
    next_recorded = dict(zip(ordered, ordered[1:]))
    positions, closed = {}, {}
    seen_fills, sold_today = set(), set()
    previous = ''
    commission, tax, notional = [], [], []
    for row in fills:
        day, symbol, side = row.get('date'), row.get('symbol'), row.get('side')
        session(day)
        if day not in ordered or day < previous or symbol not in INCLUDED or side not in ('buy', 'sell'):
            raise ValueError('fill_chronology_or_scope_invalid')
        if day != previous:
            sold_today = set()
        previous = day
        key = (day, symbol, side)
        if key in seen_fills:
            raise ValueError('duplicate_fill')
        seen_fills.add(key)
        quantity, price = row.get('shares'), row.get('price')
        if type(quantity) is not int or quantity <= 0 or quantity % a['lot'] or not finite(price) or price <= 0:
            raise ValueError('invalid_fill_quantity_or_price')
        value = quantity * price
        fee = max(a['minimum_commission'], value * a['commission'])
        commission.append(fee)
        tax.append(value * a['sell_tax'] if side == 'sell' else 0)
        notional.append(value)
        if side == 'buy':
            signal_day = row.get('signal_date')
            session(signal_day)
            signal = by_signal.get((symbol, signal_day))
            if (symbol in positions or symbol in sold_today or next_recorded.get(signal_day) != day
                    or not signal or signal.get('plan_state') != 'eligible_proxy'):
                raise ValueError('buy_signal_or_recorded_session_invalid')
            positions[symbol] = {'entry_date': day, 'shares': quantity, 'cost_basis': value + fee}
        else:
            opening = positions.pop(symbol, None)
            if not opening or opening['shares'] != quantity or opening['entry_date'] >= day:
                raise ValueError('sell_without_prior_position')
            closed[(symbol, opening['entry_date'], day)] = opening
            sold_today.add(symbol)
    if len(trades) != len(closed):
        raise ValueError('completed_trade_fill_count_mismatch')
    seen_trades = set()
    for trade in trades:
        key = (trade.get('symbol'), trade.get('entry_date'), trade.get('exit_date'))
        position = closed.get(key)
        if key in seen_trades or position is None or trade.get('shares') != position['shares']:
            raise ValueError('completed_trade_fill_binding_invalid')
        seen_trades.add(key)
        if not finite(trade.get('net_pnl')) or not finite(trade.get('net_return')):
            raise ValueError('trade_nonfinite')
        checks.equal_number('trade_return_from_exported_pnl:' + ':'.join(key),
                            trade['net_return'], trade['net_pnl'] / position['cost_basis'])
    retained = result.get('open_positions')
    if not isinstance(retained, dict) or set(retained) != set(positions):
        raise ValueError('terminal_positions_missing')
    for symbol, position in positions.items():
        checks.require('terminal_position_identity:' + symbol,
                       all(retained[symbol].get(k) == v for k, v in position.items()))

    equities = [row['equity'] for row in curve]
    total = equities[-1] / equities[0] - 1
    period_years = (dates[-1] - dates[0]).days / 365.2425
    peak, deepest, underwater, longest = equities[0], 0., 0, 0
    for equity in equities:
        peak = max(peak, equity)
        deepest = min(deepest, equity / peak - 1)
        underwater = underwater + 1 if equity < peak else 0
        longest = max(longest, underwater)
    returns = [equities[i] / equities[i-1] - 1 for i in range(1, len(equities))]
    volatility = statistics.stdev(returns) if len(returns) > 1 else 0
    metric = {'net_total_return': total,
              'net_cagr': (equities[-1] / equities[0]) ** (1 / period_years) - 1,
              'maximum_drawdown': deepest, 'longest_underwater_sessions': longest,
              'sharpe_zero_cash_rate': statistics.mean(returns) / volatility * math.sqrt(252) if volatility else None,
              'completed_trades': len(trades),
              'winning_trade_fraction': sum(t['net_pnl'] > 0 for t in trades) / len(trades) if trades else None,
              'average_exposure': statistics.mean(row['exposure'] for row in curve[1:]),
              'ending_equity': equities[-1], 'ending_cash': curve[-1]['cash'],
              'ending_receivables': curve[-1]['receivables'],
              'turnover_over_initial_capital': math.fsum(notional) / a['initial_cash']}
    costs = {'commission': math.fsum(commission), 'sell_tax': math.fsum(tax),
             'traded_notional': math.fsum(notional)}
    exported = result.get('metrics', {})
    for key, value in metric.items():
        checks.equal_number('metric:' + key, exported.get(key), value)
    for key, value in costs.items():
        checks.equal_number('cost:' + key, exported.get('costs_twd', {}).get(key), value)
    # PnL is exported, not independently marked. Do not derive gross return by
    # subtracting an unverified slippage claim from this already net curve.
    return {'metrics': metric, 'fill_derived_costs': costs, 'curve_rows': len(curve),
            'fills': len(fills), 'retained_open_positions': len(positions),
            'reported_slippage_unverified': exported.get('costs_twd', {}).get('slippage')}


def load_pinned_bundle(baseline, inventory):
    inventory_raw = read_regular(inventory)
    if digest(inventory_raw) != INVENTORY_SHA256:
        raise ValueError('frozen_inventory_hash_mismatch')
    entries = strict_json(inventory_raw)
    if not isinstance(entries, dict) or set(entries) != FILE_NAMES:
        raise ValueError('frozen_inventory_scope_invalid')
    bundle, identities = {}, []
    with open_directory(baseline) as parent:
        for name in sorted(FILE_NAMES):
            raw = read_regular(name, dir_fd=parent)
            if digest(raw) != entries[name]:
                raise ValueError('frozen_artifact_hash_mismatch:' + name)
            value = ([strict_json(line) for line in raw.splitlines() if line.strip()]
                     if name.endswith('.jsonl') else strict_json(raw))
            bundle[name] = value
            identities.append({'name': name, 'bytes': len(raw), 'sha256': entries[name]})
    return bundle, identities


def audit(baseline=BASELINE, inventory=INVENTORY):
    checks = Checks()
    report = {'schema': 'legacy-derived-artifact-audit-v1', 'scope': 'retained_derived_outputs_only',
              'original_source_commit': ORIGINAL_COMMIT, 'expected_run_id': RUN_ID,
              'inventory_sha256': INVENTORY_SHA256, 'dataset_manifest_sha256': DATASET_SHA256,
              'registry_sha256': REGISTRY_SHA256,
              'promotion_eligible': False, 'holdout_and_forward_checked': False,
              'investment_validation': 'failed_insufficient_evidence',
              'submission_blocked': 'legacy_artifact_has_no_compatible_three_arm_pit_parents',
              'new_simulations': 0, 'network_requests': 0, 'holdout_read': False,
              'expected_original_panel': PANEL, 'artifacts': [], 'trials': [],
              'unavailable': [
                  {'check': name, 'status': 'unavailable', 'reason': reason} for name, reason in (
                      ('actual_fills_and_slippage', 'normalized_open_prices_order_queue_and_liquidity_not_loaded'),
                      ('market_marks_and_dividend_accounting', 'raw_market_and_payment_evidence_not_loaded'),
                      ('official_session_and_action_replay', 'known_1216_20230803_action_calendar_issue_requires_separate_reviewed_replay'),
                      ('historical_point_in_time', 'official_effective_date_reconstruction_is_not_historical_availability'),
                      ('all_market_generalization', 'fixed_survivor_panel_has_no_historical_investable_universe'),
                      ('research_and_kol_comparison_arms', 'retained_run_has_technical_only_hypotheses'),
                      ('holdout_forward_and_profitability', 'holdout_stays_sealed_no_forward_results_or_promotion'))]}
    try:
        bundle, report['artifacts'] = load_pinned_bundle(baseline, inventory)
        summary = bundle['results.json']
        registry = bundle['preregistration.json']
        manifest = bundle['dataset-manifest.json']
        checks.require('run_and_source_identity', summary['run_id'] == RUN_ID
                       and summary['source']['commit'] == ORIGINAL_COMMIT
                       and summary['dataset_hash'] == DATASET_SHA256
                       and summary['registry_hash'] == REGISTRY_SHA256)
        checks.require('development_period_and_sealed_holdout',
                       summary['period'] == ['2019-01-01', '2023-12-31']
                       and summary['holdout_accessed'] is False and summary['promotion_eligible'] is False
                       and manifest['holdout_accessed'] is False
                       and manifest['requested_session_range'] == ['2018-01-01', '2023-12-31'])
        coverage = summary['coverage']
        report['coverage'] = coverage
        checks.require('original_panel_and_predeclared_exclusions', coverage['requested_panel'] == PANEL
                       and coverage['included_panel'] == INCLUDED
                       and set(coverage['exclusions']) == {'2317', '2603', '2882'}
                       and registry['population']['symbols'] == PANEL)
        checks.require('all_symbol_hypothesis_terminals_retained', set(summary['by_symbol']) == set(PANEL)
                       and all({row['strategy_id'] for row in summary['by_symbol'][symbol]['strategy_coverage']}
                               == {'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'} for symbol in PANEL))
        ledger = rows(bundle['trial-ledger.jsonl'], 'ledger')
        expected_keys = {(sid, scenario) for sid in STRATEGIES for scenario in SCENARIOS} | {('S5', None), ('S7', None)}
        keys = [(row.get('strategy_id'), row.get('scenario')) for row in ledger]
        if len(keys) != len(expected_keys) or set(keys) != expected_keys:
            raise ValueError('trial_ledger_missing_or_duplicate')
        report['blocked_hypotheses'] = [row for row in ledger if row['strategy_id'] in ('S5', 'S7')]
        checks.require('s5_s7_remain_blocked', all(row['status'] == 'blocked' for row in report['blocked_hypotheses']))
        for sid in STRATEGIES:
            for scenario in SCENARIOS:
                trial_checks = Checks()
                name = f'{sid}-{scenario}.json'
                result = bundle[name]
                ledger_row = next(row for row in ledger if (row['strategy_id'], row['scenario']) == (sid, scenario))
                trial = {'strategy': sid, 'scenario': scenario, 'file': name,
                         'reported_status': result.get('status'), 'checks': trial_checks.rows}
                try:
                    trial_checks.require('exploratory_not_promoted', result.get('status') == 'exploratory')
                    trial_checks.require('ledger_exact_result_binding', ledger_row['result_file'] == name
                                         and ledger_row['metrics'] == result['metrics']
                                         and ledger_row['parameter_variant'] is False)
                    trial['recomputed'] = recompute_derived(result, bundle[f'{sid}-signals.json'], scenario, trial_checks)
                    if sid == 'S4':
                        trial_checks.require('zero_signal_and_trade_path_retained',
                                             bundle['S4-signals.json'] == [] and result['trades'] == [] and result['fills'] == [])
                except (ValueError, KeyError, TypeError, OverflowError, ZeroDivisionError) as error:
                    trial_checks.require('derived_input_validation', False)
                    trial['error'] = type(error).__name__ + ':' + str(error)[:160]
                trial['status'] = 'failed' if any(row['status'] == 'failed' for row in trial_checks.rows) else 'verified'
                report['trials'].append(trial)
    except (ValueError, KeyError, TypeError, OSError, UnicodeError, RecursionError) as error:
        checks.require('pinned_bundle_admission', False)
        # Do not copy arbitrary paths or file contents into a diagnostic receipt.
        report['admission_error'] = str(error)[:160] if isinstance(error, ValueError) else type(error).__name__
    report['checks'] = checks.rows
    failed = any(row['status'] == 'failed' for row in checks.rows) or any(row['status'] == 'failed' for row in report['trials'])
    if len(report['trials']) != 15:
        failed = True
    report['audit_status'] = 'failed' if failed else 'partial_derived_verified'
    report['program_status'] = 'completed_with_discrepancies' if failed else 'completed'
    report['exit_code'] = 2 if failed else 0
    return report


def auditor_identity():
    try:
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT,
                                       stderr=subprocess.DEVNULL, text=True).strip()
    except (OSError, subprocess.SubprocessError):
        head = None
    return {'checkout_head': head, 'auditor_sha256': digest(read_regular(__file__)),
            'note': 'Program bytes are bound separately; checkout HEAD alone is not an exact-review attestation.'}


def write_report(output, report):
    """New private directory and exclusive files; no overwrite or cleanup retry."""
    runtime_preflight()
    output = absolute_input(output)
    with open_directory(output.parent) as parent:
        os.mkdir(output.name, 0o700, dir_fd=parent)
        descriptor = open_child_directory(parent, output.name)
    try:
        os.fchmod(descriptor, 0o700)
        raw = canonical(report)
        receipt = {'schema': 'legacy-derived-artifact-audit-receipt-v1',
                   'created_at': datetime.now(timezone.utc).isoformat(),
                   'report_sha256': digest(raw), 'report_bytes': len(raw),
                   'auditor': auditor_identity(), 'audit_status': report['audit_status'],
                   'program_exit_code': report['exit_code'],
                   'investment_validation': report['investment_validation'],
                   'promotion_eligible': False, 'holdout_and_forward_checked': False,
                   'submission_performed': False}
        for name, value in (('report.json', raw), ('receipt.json', canonical(receipt))):
            fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=descriptor)
            with os.fdopen(fd, 'wb') as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(value)
                stream.flush()
                os.fsync(stream.fileno())
        os.fsync(descriptor)
        return receipt
    finally:
        os.close(descriptor)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact', type=Path, default=BASELINE)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        runtime_preflight()
    except UnsupportedRuntime:
        print(json.dumps({'program_status': 'unsupported_runtime', 'exit_code': 2,
                          'reason': 'required_descriptor_safety_unavailable',
                          'promotion_eligible': False, 'output_created': False}))
        return 2
    report = audit(args.artifact)
    try:
        receipt = write_report(args.output, report)
    except (OSError, ValueError, NotImplementedError):
        print(json.dumps({'program_status': 'output_refused', 'exit_code': 2,
                          'promotion_eligible': False}))
        return 2
    print(json.dumps({'program_status': report['program_status'], 'audit_status': report['audit_status'],
                      'investment_validation': report['investment_validation'],
                      'promotion_eligible': False, 'report_sha256': receipt['report_sha256'],
                      'trials_audited': len(report['trials']), 'exit_code': report['exit_code']}))
    return report['exit_code']


if __name__ == '__main__':
    raise SystemExit(main())

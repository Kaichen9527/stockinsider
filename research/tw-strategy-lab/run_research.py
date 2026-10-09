#!/usr/bin/env python3
"""Run frozen development hypotheses; refuse 2024+ data and never publish."""
import argparse
import csv
from dataclasses import replace, asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

from engine import Assumptions, simulate
from strategies import STRATEGY_IDS, generate_signals, strategy_coverage

ROOT = Path(__file__).resolve().parent
PANEL = ('2330', '2317', '1216', '2882', '2603', '6488', '5347', '8069')
START, END = '2019-01-01', '2023-12-31'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()


def source_identity():
    try:
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
        dirty = subprocess.check_output(['git', 'status', '--porcelain', '--', '*.py', 'preregistration.json', 'preregistration.sha256'], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
        return {'commit': commit, 'research_sources_dirty': bool(dirty), 'exact_review_attestation': False}
    except (OSError, subprocess.CalledProcessError):
        return {'commit': None, 'research_sources_dirty': None, 'exact_review_attestation': False}


def load_dataset(directory):
    directory = Path(directory)
    manifest_bytes = (directory / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get('holdout_accessed') is not False or manifest.get('requested_session_range') != ['2018-01-01', '2023-12-31']:
        raise ValueError('dataset_scope_or_holdout_mismatch')
    tables = {}
    for name in ('prices.csv', 'benchmark.csv', 'corporate_actions.csv'):
        raw = (directory / name).read_bytes()
        if digest(raw) != manifest['outputs'][name]['sha256']:
            raise ValueError('dataset_hash_mismatch_or_download_checkpoint_in_progress')
        rows = list(csv.DictReader(raw.decode().splitlines()))
        if any(row['session'] >= '2024-01-01' for row in rows):
            raise ValueError('holdout_data_forbidden')
        tables[name] = rows
    if (directory / 'manifest.json').read_bytes() != manifest_bytes:
        raise ValueError('dataset_changed_during_read')
    benchmark = {r['session']: float(r['total_return_index']) for r in tables['benchmark.csv']}
    if len(benchmark) != len(tables['benchmark.csv']):
        raise ValueError('duplicate_benchmark_session')
    bars, actions, exclusions = {}, {}, {}
    incomplete_benchmark = any(s['type'] == 'benchmark' for s in manifest.get('unavailable_sources', []))
    for symbol in PANEL:
        reasons = []
        if incomplete_benchmark:
            reasons.append('benchmark_download_incomplete')
        for key, values in manifest.get('blocked_symbol_years', {}).items():
            if key.startswith(symbol + '/'):
                reasons.extend(values)
        selected = [r for r in tables['prices.csv'] if r['symbol'] == symbol]
        events = [r for r in tables['corporate_actions.csv'] if r['symbol'] == symbol]
        if len({r['session'] for r in selected}) != len(selected):
            reasons.append('duplicate_price_session')
        if {r['session'] for r in selected} != set(benchmark):
            reasons.append('stock_and_benchmark_sessions_differ')
        if len(selected) < 240:
            reasons.append('insufficient_warmup')
        converted = []
        for event in events:
            if event['status'] != 'resolved':
                reasons.append('unresolved_corporate_action')
                continue
            if float(event['share_factor'] or 0) != 1 or float(event.get('cash_return') or 0) != 0:
                reasons.append('share_change_or_return_of_capital_execution_unmodeled')
                continue
            converted.append(dict(session=event['session'], status='verified',
                                  price_factor=float(event['price_factor']), share_factor=1.,
                                  cash_dividend=float(event['cash_dividend'] or 0),
                                  payment_date=event.get('cash_available_date') or None,
                                  knowledge_mode='official_effective_date_reconstruction',
                                  source_sha256=event['source_sha256']))
        if reasons:
            exclusions[symbol] = sorted(set(reasons))
            continue
        bars[symbol] = [dict(date=r['session'], **{k: float(r[k]) for k in ('open', 'high', 'low', 'close', 'turnover_twd')},
                            volume=float(r['volume_shares'])) for r in sorted(selected, key=lambda r: r['session'])]
        actions[symbol] = converted
    return manifest, digest(manifest_bytes), bars, actions, benchmark, exclusions


def window_statistics(curve):
    # Descriptive fixed windows on the same development path, not OOS folds.
    windows = []
    for year in range(2019, 2024):
        for half in (1, 2):
            start, end = (f'{year}-01-01', f'{year}-06-30') if half == 1 else (f'{year}-07-01', f'{year}-12-31')
            before = [r for r in curve if r['date'] < start]
            inside = [r for r in curve if start <= r['date'] <= end]
            if before and inside:
                windows.append(dict(start=start, end=end, net_return=inside[-1]['equity'] / before[-1]['equity'] - 1))
    return windows


def run(data_dir, output_dir):
    out = Path(output_dir)
    if out.exists():
        raise ValueError('output_already_exists_use_new_immutable_run_directory')
    registry_bytes = (ROOT / 'preregistration.json').read_bytes()
    if digest(registry_bytes) != (ROOT / 'preregistration.sha256').read_text().strip():
        raise ValueError('preregistration_changed_after_freeze_new_review_required')
    registry = json.loads(registry_bytes)
    manifest, dataset_hash, bars, actions, benchmark, exclusions = load_dataset(data_dir)
    code_hashes = {p: digest((ROOT / p).read_bytes()) for p in ('engine.py', 'strategies.py', 'run_research.py', 'official_data.py')}
    identity = dict(dataset_hash=dataset_hash, registry_hash=digest(registry_bytes), code_hashes=code_hashes,
                    period=[START, END], hypotheses=list(STRATEGY_IDS))
    run_id = digest(canonical(identity))[:24]
    result = dict(schema_version='tw-strategy-lab-results-v1', run_id=run_id, **identity,
                  created_at=datetime.now(timezone.utc).isoformat(),
                  source=source_identity(),
                  validation_status='exploratory_fixed_survivor_panel',
                  holdout_accessed=False, promotion_eligible=False,
                  live_articles_updated=0, live_candidate_snapshot_available=False,
                  coverage=dict(requested_panel=list(PANEL), included_panel=sorted(bars), exclusions=exclusions,
                                available_source_requests=manifest['available_requests'], expected_source_requests=manifest['expected_requests']),
                  by_symbol={s: {'strategy_coverage': []} for s in PANEL}, strategies=[], trials=[],
                  limitations=['Fixed surviving panel selected today; no historical App-screen membership.',
                               'Complete cash-only subset excludes unresolved share changes before inspecting performance.',
                               'Development results are not out-of-sample validation. 2024 onward remains locked.',
                               'No original broker PIT feed, monthly revenue release ledger, historical sector membership or live candidate export.',
                               'Daily auction fills/limits are a conservative proxy; exact queue and exceptional limit rules unavailable.',
                               'Unknown dividend payment dates reduce reusable cash; entitlements remain in equity.',
                               'No statistical alpha claim or production promotion from this exploratory run.'])
    sessions = sorted(benchmark)
    variants = {'baseline': Assumptions(),
                'cost_stress': replace(Assumptions(), commission=.00285, minimum_commission=40, slippage_bps=20),
                'small_capacity': replace(Assumptions(), initial_cash=1_000_000)}
    if registry['hypothesis_ids'] != list(STRATEGY_IDS) or registry['population']['symbols'] != list(PANEL):
        raise ValueError('registry_hypothesis_or_population_mismatch')
    if registry['dates']['development_start'] != START or registry['dates']['development_end'] != END:
        raise ValueError('registry_period_mismatch')
    if {key: registry['assumptions'].get(key) for key in asdict(Assumptions())} != asdict(Assumptions()):
        raise ValueError('registry_execution_assumptions_mismatch')
    if registry['executable_ids'] != ['S1', 'S2', 'S3', 'S4', 'S6'] or registry['parameter_variants']:
        raise ValueError('registry_executable_hypotheses_mismatch')
    if {v['id']: v['overrides'] for v in registry['scenarios']} != {
        'baseline': {}, 'cost_stress': {'commission': .00285, 'minimum_commission': 40, 'slippage_bps': 20},
        'small_capacity': {'initial_cash': 1_000_000}}:
        raise ValueError('registry_cost_scenario_mismatch')
    out.mkdir(parents=True)
    (out / 'started.json').write_bytes(canonical(dict(identity, run_id=run_id, state='running')))
    def record_trial(trial):
        result['trials'].append(trial)
        with (out / 'trial-ledger.jsonl').open('a') as stream:
            stream.write(json.dumps(trial, ensure_ascii=False, allow_nan=False) + '\n')
    result['panel_benchmarks'] = {}
    if bars:
        for name, assumptions in variants.items():
            try:
                anchor = max(s for s in sessions if s < START)
                passive = []
                for symbol, symbol_bars in bars.items():
                    last = next(b for b in symbol_bars if b['date'] == anchor)
                    from engine import round_price
                    passive.append(dict(date=anchor, symbol=symbol, plan_state='eligible_proxy', rank=0,
                                        buy_limit=round_price(last['close'] * 1.1), entry_lower=0, stop=0,
                                        exit_ma=1_000_000, max_hold=1_000_000))
                sim = simulate(bars, passive, sessions, start=START, end=END, actions_by_symbol=actions, assumptions=assumptions)
                sim['definition'] = 'Initial buy-and-hold, same complete panel, 10% budget per stock; remaining cash, same costs; no rebalance.'
                path = f'panel-benchmark-{name}.json'
                (out / path).write_bytes(canonical(sim))
                result['panel_benchmarks'][name] = dict(status=sim['status'], metrics=sim['metrics'], definition=sim['definition'], result_file=path)
            except (ValueError, AssertionError, TypeError, KeyError, ArithmeticError, StopIteration) as exc:
                result['panel_benchmarks'][name] = dict(status='failed', error=str(exc))
    for sid in STRATEGY_IDS:
        coverage = strategy_coverage(sid)
        strategy = dict(coverage, scenarios={})
        blocked = sid in ('S5', 'S7') or not bars or (sid == 'S3' and len(bars) < 5)
        if blocked:
            strategy['status'] = 'blocked'
            strategy['reason'] = coverage['reason'] or ('fewer_than_five_complete_momentum_members' if sid == 'S3' and bars else 'no_complete_cash_action_supported_panel')
            signals = []
        else:
            try:
                signals = generate_signals(bars, sid, actions, allow_reconstructed_history=True)
            except (ValueError, TypeError, KeyError, ArithmeticError) as exc:
                signals = []
                strategy.update(status='failed', reason='signal_generation_failed:' + str(exc))
                for name in variants:
                    record_trial(dict(trial_id=f'{run_id}:{sid}:{name}', strategy_id=sid, scenario=name,
                                      status='failed', error=str(exc), parameter_variant=False))
                for symbol in PANEL:
                    result['by_symbol'][symbol]['strategy_coverage'].append(dict(strategy_id=sid, status='failed', signal_count=None, reasons=[strategy['reason']]))
                result['strategies'].append(strategy)
                continue
            (out / f'{sid}-signals.json').write_bytes(canonical(signals))
            for name, assumptions in variants.items():
                trial = dict(trial_id=f'{run_id}:{sid}:{name}', strategy_id=sid, scenario=name, parameter_variant=False)
                try:
                    sim = simulate(bars, signals, sessions, start=START, end=END, actions_by_symbol=actions, assumptions=assumptions)
                    baseline_index = benchmark[sim['curve'][0]['date']]
                    last_index = benchmark[sim['curve'][-1]['date']]
                    sim['benchmark'] = dict(name='TAIEX total return index, no fees', total_return=last_index / baseline_index - 1,
                                            exposure_matching=False, note='Fully invested index vs strategy cash allocation; not a risk-matched alpha test.')
                    sim['development_half_year_windows'] = window_statistics(sim['curve'])
                    trial.update(status=sim['status'], metrics=sim['metrics'], result_file=f'{sid}-{name}.json')
                    strategy['scenarios'][name] = dict(status=sim['status'], metrics=sim['metrics'],
                                                      benchmark=sim['benchmark'], result_file=trial['result_file'])
                    (out / trial['result_file']).write_bytes(canonical(sim))
                except (ValueError, AssertionError, TypeError, KeyError, ArithmeticError) as exc:
                    trial.update(status='failed', error=str(exc))
                    strategy['scenarios'][name] = dict(status='failed', error=str(exc))
                record_trial(trial)
            strategy['status'] = 'exploratory' if all(s['status'] == 'exploratory' for s in strategy['scenarios'].values()) else 'failed'
        strategy['signal_count'] = len(signals)
        if blocked:
            record_trial(dict(trial_id=f'{run_id}:{sid}:blocked', strategy_id=sid, scenario=None,
                              status='blocked', reason=strategy['reason'], parameter_variant=False))
        for symbol in PANEL:
            count = sum(s['symbol'] == symbol for s in signals)
            terminal = 'blocked' if blocked or symbol in exclusions else 'failed' if strategy['status'] == 'failed' else 'evaluated' if count else 'no_signals'
            result['by_symbol'][symbol]['strategy_coverage'].append(dict(strategy_id=sid, status=terminal,
                signal_count=None if terminal == 'blocked' else count,
                reasons=exclusions.get(symbol, []) + ([strategy.get('reason')] if blocked else [])))
        result['strategies'].append(strategy)
    (out / 'results.json').write_bytes(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False).encode() + b'\n')
    (out / 'preregistration.json').write_bytes(registry_bytes)
    (out / 'dataset-manifest.json').write_bytes(json.dumps(manifest, ensure_ascii=False, indent=2).encode() + b'\n')
    lines = ['# 台股策略開發樣本研究', '', f'Run: `{run_id}`',
             '', '**這是固定倖存股票樣本的探索研究；未通過正式策略驗收，未更新線上文章。**',
             '', f'資料：2018 暖機，{START} 至 {END} 開發；2024 年起保留資料未讀取。',
             f'完整可執行樣本：{", ".join(sorted(bars)) or "無"}；原始研究 panel：{", ".join(PANEL)}。',
             '', '| 策略 | 狀態 | 基準情境淨年化 | 最大回撤 | 完成交易 |', '|---|---|---:|---:|---:|']
    for s in result['strategies']:
        metric = s['scenarios'].get('baseline', {}).get('metrics')
        lines.append(f'| {s["strategy_id"]} {s["name"]} | {s["status"]} | ' +
                     (f'{metric["net_cagr"]:.2%} | {metric["maximum_drawdown"]:.2%} | {metric["completed_trades"]} |' if metric else '— | — | — |'))
    lines += ['', '## 資料與解讀限制', '', *['- ' + x for x in result['limitations']],
              '', '## 排除與尚待補齊', '', '```json', json.dumps(exclusions, ensure_ascii=False, indent=2), '```',
              '', '全部成本／容量情境與失敗試驗保留在 results.json、trial-ledger.jsonl；沒有挑選績效最佳參數。']
    (out / 'report.md').write_text('\n'.join(lines) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    outcome = run(args.data, args.output)
    print(json.dumps({'run_id': outcome['run_id'], 'included_panel': outcome['coverage']['included_panel'],
                      'trials': len(outcome['trials']), 'holdout_accessed': False, 'output': str(args.output)}, ensure_ascii=False))

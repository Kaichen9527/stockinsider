"""Reconcile captured terminal-run identities, financial gaps and official revenues.

Offline only. No database access, backtest, current nominations, price target or
publisher. A complete revenue brief is NOT a complete investment recommendation.
The input SHA-256 values bind already-acquired receipts, not new server authority.
"""
from __future__ import annotations
import argparse
from collections import Counter
import csv
from datetime import datetime
from decimal import Decimal
import json
from pathlib import Path
import re
import subprocess
import revenue_briefs as revenue

ROOT = Path(__file__).resolve().parents[2]
MAX_BYTES = 32 * 1024 * 1024


def strict(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value: raise ValueError('duplicate_json_key')
            value[key] = item
        return value
    def nonfinite(_): raise ValueError('nonfinite_json')
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=nonfinite)


def read(path, expected=None):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_BYTES:
        raise ValueError('input_file_type_or_size')
    raw = path.read_bytes()
    if len(raw) > MAX_BYTES or (expected is not None and revenue.sha(raw) != expected):
        raise ValueError('input_hash_or_size_mismatch')
    return raw


def time(value):
    if not isinstance(value, str): raise ValueError('invalid_timestamp')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None: raise ValueError('timezone_required')
    return parsed


def count(value):
    if type(value) is not int or not 0 <= value <= 100000:
        raise ValueError('invalid_count')
    return value


def keyed(rows, field):
    if not isinstance(rows, list) or len(rows) > 5000 or any(not isinstance(r, dict) for r in rows):
        raise ValueError('invalid_rows')
    values = [r.get(field) for r in rows]
    if any(not isinstance(v, str) or not v for v in values) or len(set(values)) != len(values):
        raise ValueError('duplicate_or_missing_identity')
    return dict(zip(values, rows))


def reconcile(snapshot, readiness, gaps, manifest, tables):
    if (snapshot.get('schema_version') != 'candidate-terminal-run-audit-v1'
            or snapshot.get('terminal_run_accounted_for') is not True
            or any(snapshot.get(key) is not False for key in ('complete', 'authoritative_snapshot_available', 'full_app_coverage_verified', 'publish_allowed', 'production_updated'))):
        raise ValueError('bounded_readonly_projection_required')
    if (readiness.get('production_written') is not False or gaps.get('production_written') is not False
            or readiness.get('credentials_exported') is not False or gaps.get('credentials_exported') is not False
            or readiness.get('host') != '5.104.83.211' or gaps.get('host') != '5.104.83.211'):
        raise ValueError('readonly_host_evidence_required')
    db, gd = readiness['database'], gaps['database']
    if (gd.get('schema') != 'candidate-financial-gap-audit-v1' or db.get('schema') != 'candidate-repeatable-read-audit-v1'
            or any(d.get('transaction_read_only') != 'on' or d.get('transaction_isolation') != 'repeatable read' for d in (db, gd))):
        raise ValueError('readonly_transaction_required')
    if (db['run'] != gd['run'] or snapshot['run']['id'] != db['run']['id']
            or time(snapshot['as_of']) != time(db['run']['evaluation_at'])
            or time(gaps['observed_at']) > time(readiness['observed_at'])
            or time(gaps['observed_at']) < time(db['run']['finished_at'])):
        raise ValueError('different_or_inconsistent_run')
    # Two captured transactions may differ. All item/version fields used in this
    # package must match, not just their total counts or symbol strings.
    items, gapitems, candidates = (keyed(rows, 'symbol') for rows in (db['items'], gd['items'], snapshot['candidates']))
    n = count(db['run']['candidate_count'])
    if set(items) != set(gapitems) or set(items) != set(candidates) or len(items) != n or n != snapshot['expected_count']:
        raise ValueError('run_inventory_mismatch')
    if manifest.get('schema') != 'current-revenue-editorial-batch-v1' or manifest.get('target_period') != '2026-08':
        raise ValueError('unsupported_revenue_batch')
    sources = keyed(manifest.get('sources'), 'id')
    if set(sources) != set(revenue.SOURCES) or set(tables) != set(revenue.SOURCES):
        raise ValueError('source_inventory_mismatch')
    for market, source in sources.items():
        if source.get('status') != 'parsed' or (source.get('url'), source.get('metadata_url')) != revenue.SOURCES[market]:
            raise ValueError('official_source_receipt_missing')
        if time(source['observed_at']) > time(readiness['observed_at']): raise ValueError('future_revenue_receipt')
    results, field_counts, reasons = [], Counter(), Counter()
    for symbol in sorted(items):
        item, gap, candidate = items[symbol], gapitems[symbol], candidates[symbol]
        if not re.fullmatch('[0-9]{4}', symbol): raise ValueError('invalid_symbol')
        for key in ('id', 'run_id', 'stock_id', 'symbol', 'status', 'detail_revision_id', 'finished_at'):
            if item.get(key) != gap.get(key): raise ValueError('run_item_or_revision_changed')
        if candidate['stock_id'] != item['stock_id'] or candidate.get('research_status') != item['status']:
            raise ValueError('candidate_binding_changed')
        identity_ok = candidate.get('security_type') == 'common_stock' and candidate.get('exchange') in revenue.SOURCES
        revision_ok = candidate.get('revision') is not None and candidate['revision'] == item.get('detail_revision_id')
        row = tables.get(candidate.get('exchange'), {}).get(symbol)
        if row is not None and (not identity_ok or row['公司名稱'].strip() != candidate.get('name')):
            row = None  # Do not overwrite the authoritative name with an unmatched CSV issuer.
            identity_ok = False
        record, text = revenue.brief({'symbol': symbol, 'name': candidate.get('name') or '身分未核對'}, row,
                                     candidate.get('exchange') if identity_ok else None, identity_ok, '2026-08')
        fin = gap.get('financial_coverage')
        if not isinstance(fin, dict) or not isinstance(fin.get('missing'), list): raise ValueError('financial_gap_shape')
        required, verified = count(fin.get('requiredFieldPeriods')), count(fin.get('verifiedFieldPeriods'))
        missing = fin['missing']
        if any(not isinstance(x, dict) or not isinstance(x.get('factKey'), str) or not isinstance(x.get('periodEnd'), str) for x in missing):
            raise ValueError('financial_gap_shape')
        tuples = [(x['factKey'], x['periodEnd']) for x in missing]
        if len(set(tuples)) != len(tuples) or required != verified + len(tuples):
            raise ValueError('financial_gap_cardinality')
        if (fin.get('status') == 'complete') != (len(tuples) == 0): raise ValueError('financial_gap_status_mismatch')
        for fact, end in tuples:
            if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_ :.-]{0,159}', fact): raise ValueError('financial_gap_key')
            if end == 'latest_reported_quarter':
                if fact not in {segment + ':' + metric for segment in ('Display', 'Mobility Solutions', 'Vertical Solutions') for metric in ('revenue', 'operating_income')}:
                    raise ValueError('unrecognized_symbolic_period')
            elif re.fullmatch(r'\d{4}-\d{2}-\d{2}', end):
                datetime.strptime(end, '%Y-%m-%d')
            else:
                raise ValueError('financial_gap_key')
            field_counts[fact] += 1
        model = gap.get('model_coverage')
        if not isinstance(model, dict): raise ValueError('model_gap_shape')
        blockers = list(record['blockers'])
        if not revision_ok: blockers.append('immutable_revision_unverified')
        if fin['status'] != 'complete': blockers.append('quarterly_financial_evidence_incomplete')
        if gap.get('technical_status') != 'success': blockers.append('technical_history_incomplete')
        if model.get('next12mBridgeComplete') is not True: blockers.append('forward_earnings_bridge_incomplete')
        if model.get('status') != 'complete': blockers.append('valuation_method_incomplete')
        blockers.extend(['current_full_app_universe_not_attested', 'publication_acceptance_not_granted'])
        reasons.update(set(blockers))
        # Only this factual brief is mechanically fact-checked. No claim that all
        # company disclosures, editorial judgments or investment gates are passed.
        financial_summary = {key: fin[key] for key in ('status', 'requiredFieldPeriods', 'verifiedFieldPeriods')}
        record.update(candidate_binding={key: candidate.get(key) for key in ('stock_id', 'revision', 'instrument_authority_id', 'exchange', 'session_date', 'revision_available_at')},
            terminal_run_id=db['run']['id'], financial_coverage=financial_summary, missing_field_periods=missing,
            valuation_method=gap.get('valuation_method'), model_status=model.get('status'),
            technical_status=gap.get('technical_status'), next_12m_bridge_complete=model.get('next12mBridgeComplete'),
            numerical_editorial_check_passed=record['status'] == 'factual_brief_complete' and identity_ok and revision_ok,
            full_investment_article_ready=False, reason_codes=sorted(set(blockers)))
        text = text.replace('本稿尚未取得正式候選當前 revision、財務驗證收據與逐篇發布驗收，未匯入正式文章。',
                            '本稿已對照下列特定資料庫研究批次的公司身分及版本；不代表全 App 當前名單已核定，財務證據與正式發布仍須另外驗收。')
        if record['status'] == 'factual_brief_complete':
            facts = record['facts']
            current = facts['amounts']['revenue']
            intro = f"本月營收約新台幣 {Decimal(current) / Decimal('100000'):,.2f} 億元。"
            for key, label in (('mom', '月增率'), ('yoy', '年增率'), ('ytd_yoy', '累計年增率')):
                rate = facts['reported_percent'][key]
                if rate is not None:
                    shown = f"{Decimal(rate):,.2f}"
                    text = text.replace(f"{label}公告欄位：{rate}%", f"{label}公告欄位：{shown}%")
            first_section = text.find('\n\n')
            text = text[:first_section] + '\n\n' + intro + ' 顯示數字四捨五入至小數第二位；算術核對使用原始精度，完整原值保留於 manifest。' + text[first_section:]
        details = ['', '## 本股資料庫版本與未完成的分析', '',
            f"核對研究批次：`{db['run']['id']}`；本股版本：`{candidate.get('revision') or '未核定'}`。",
            f"批次評估時間：{db['run']['evaluation_at']}；本股行情資料日期：{candidate.get('session_date') or '未核定'}。",
            f"季度財務欄位／期間：需求 {required}，已驗證 {verified}，仍缺 {len(missing)}。",
            f"技術資料狀態：`{gap.get('technical_status')}`；估值方法：`{gap.get('valuation_method')}`；方法狀態：`{model.get('status')}`。",
            'P/B 參考模型就緒不等於完整財務模型；缺乏季度財務橋接時，不能替本股填入 EPS、合理價或進場價格。', '',
            '| 尚缺財務欄位 | 期間數 |', '|---|---:|']
        for fact, total in sorted(Counter(x['factKey'] for x in missing).items()): details.append(f'| {revenue.escaped(fact)} | {total} |')
        details += ['', '以上缺口是資料庫該批次的記錄，不表示發行公司未公告。必須經既有收據、解析與會計驗證流程補入，不能將本簡報直接當驗證收據。', '']
        results.append((record, text + '\n'.join(details)))
    report = {'schema': 'terminal-run-editorial-package-v1', 'scope': snapshot['scope'], 'as_of': snapshot['as_of'],
        'observed_at': readiness['observed_at'], 'run_id': db['run']['id'], 'run_candidate_count': n,
        'record_count': len(results), 'revenue_briefs_complete': sum(r['status'] == 'factual_brief_complete' for r, _ in results),
        'numerically_checked_briefs': sum(r['numerical_editorial_check_passed'] for r, _ in results),
        'financial_field_periods_missing': sum(field_counts.values()),
        'symbolic_period_requirements': sum(gap['periodEnd'] == 'latest_reported_quarter' for record, _ in results for gap in record['missing_field_periods']),
        'missing_by_field': dict(sorted(field_counts.items())),
        'candidate_blocker_counts': dict(sorted(reasons.items())),
        'raw_run_counts': {key: db['run'][key] for key in ('completed_count', 'partial_count', 'failed_count')},
        'consistency': 'matching_immutable_run_item_bindings_across_two_distinct_readonly_transactions',
        'full_investment_articles_complete': 0, 'published_articles': 0, 'production_written': False,
        'full_current_app_universe_attested': False, 'strategy_holdout_accessed': False}
    return report, results


def run(readiness_path, gaps_path, revenue_dir, output, expected_readiness, expected_gap, expected_manifest):
    raw = read(readiness_path, expected_readiness); readiness = strict(raw)
    gaps = strict(read(gaps_path, expected_gap))
    revenue_dir = Path(revenue_dir)
    manifest = strict(read(revenue_dir / 'manifest.json', expected_manifest))
    projected = subprocess.run(['node', '--experimental-strip-types', str(ROOT / 'scripts/project-terminal-audit.mjs'),
        str(Path(readiness_path).resolve()), expected_readiness], capture_output=True, timeout=20, check=True)
    if len(projected.stdout) > MAX_BYTES: raise ValueError('projection_size_bound')
    snapshot = strict(projected.stdout)
    tables = {}
    for source in manifest['sources']:
        market = source.get('id')
        if market not in revenue.SOURCES or market in tables: raise ValueError('unexpected_source_id')
        tables[market] = revenue.parse_csv(read(revenue_dir / 'sources' / (market + '.csv'), source['sha256']))
    report, results = reconcile(snapshot, readiness, gaps, manifest, tables)
    out = Path(output); out.mkdir(parents=True, exist_ok=False); (out / 'briefs').mkdir()
    for record, text in results:
        (out / 'briefs' / (record['symbol'] + '.md')).write_text(text, encoding='utf8')
    report['input_hashes'] = {'readiness': expected_readiness, 'financial_gaps': expected_gap, 'revenue_manifest': expected_manifest}
    report['projection_sha256'] = revenue.sha(projected.stdout)
    report['records'] = [record for record, _ in results]
    (out / 'candidate-projection.json').write_bytes(projected.stdout)
    (out / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    with (out / 'field-period-gaps.csv').open('x', encoding='utf8', newline='') as f:
        writer = csv.writer(f); writer.writerow(['symbol', 'candidate_revision', 'fact_key', 'period_end'])
        for record, _ in results:
            for gap in record['missing_field_periods']:
                writer.writerow([record['symbol'], record['candidate_binding']['revision'], gap['factKey'], gap['periodEnd']])
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('readiness', 'gaps', 'revenue-dir', 'output'):
        p.add_argument('--' + name, type=Path, required=True)
    for name in ('readiness', 'gap', 'manifest'):
        p.add_argument('--expected-' + name + '-sha256', required=True)
    a = p.parse_args()
    result = run(a.readiness, a.gaps, a.revenue_dir, a.output, a.expected_readiness_sha256, a.expected_gap_sha256, a.expected_manifest_sha256)
    print(json.dumps({key: result[key] for key in ('record_count', 'revenue_briefs_complete', 'numerically_checked_briefs', 'financial_field_periods_missing', 'full_investment_articles_complete', 'published_articles')}))

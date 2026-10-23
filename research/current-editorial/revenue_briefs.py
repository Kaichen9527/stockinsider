"""Two public official CSV reads; supplied-card factual briefs, no nomination or trading.

2026 editorial observations are isolated from the locked 2018-2023 strategy study.
Open-data attribution is retained; missing figures are never silently zero-filled.
"""
import argparse
import csv
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
from pathlib import Path
import re
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

SOURCES = {
    'TWSE': ('https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv', 'https://data.gov.tw/dataset/18420'),
    'TPEX': ('https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv', 'https://data.gov.tw/dataset/56510'),
}
CARDS_SHA256 = '1e24943467ac3053b4e163027b916f66f6fda79e0c73355055559e672791d853'
MAX_BYTES = 8 * 1024 * 1024
AMOUNTS = {'revenue': '營業收入-當月營收', 'prior_month': '營業收入-上月營收',
           'prior_year_month': '營業收入-去年當月營收', 'ytd': '累計營業收入-當月累計營收',
           'prior_year_ytd': '累計營業收入-去年累計營收'}
RATES = {'mom': '營業收入-上月比較增減(%)', 'yoy': '營業收入-去年同月增減(%)',
         'ytd_yoy': '累計營業收入-前期比較增減(%)'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def numeric(value):
    if value is None or str(value).strip() in ('', '-', '--', 'N/A'):
        return None
    text = str(value).strip().replace(',', '')
    if not re.fullmatch(r'-?\d+(?:\.\d+)?', text):
        raise ValueError('invalid_financial_number')
    result = Decimal(text)
    if not result.is_finite() or abs(result) > Decimal('100000000000000'):
        raise ValueError('financial_number_bound')
    return result


def period(value):
    text = str(value)
    if not re.fullmatch(r'\d{5}', text):
        raise ValueError('invalid_revenue_period')
    year, month = int(text[:3]) + 1911, int(text[3:])
    if not 1 <= month <= 12:
        raise ValueError('invalid_revenue_period')
    return f'{year:04d}-{month:02d}'


def parse_csv(raw):
    if len(raw) > MAX_BYTES:
        raise ValueError('revenue_response_size_bound')
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig')), strict=True)
    keys = reader.fieldnames or []
    if len(keys) != len(set(keys)) or not {'公司代號', '公司名稱', '資料年月', *AMOUNTS.values(), *RATES.values()} <= set(keys):
        raise ValueError('official_revenue_schema_mismatch')
    rows = list(reader)
    if not 1 <= len(rows) <= 5000:
        raise ValueError('revenue_row_bound')
    result = {}
    for row in rows:
        code = row['公司代號'].strip()
        if not re.fullmatch(r'\d{4}', code):
            continue
        if code in result:
            raise ValueError('duplicate_revenue_symbol')
        result[code] = row
    return result


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('revenue_redirect_not_allowed')


def fetch(url):
    if url not in [value[0] for value in SOURCES.values()]:
        raise ValueError('revenue_source_not_allowlisted')
    request = Request(url, headers={'Accept': 'text/csv', 'User-Agent': 'StockInsider-public-editorial/1'}, method='GET')
    with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=25) as response:
        if response.status != 200 or response.url != url:
            raise ValueError('revenue_transport_mismatch')
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('revenue_response_size_bound')
    return raw


def project_row(row, target_period):
    actual_period = period(row['資料年月'])
    values = {key: numeric(row.get(field)) for key, field in AMOUNTS.items()}
    rates = {key: numeric(row.get(field)) for key, field in RATES.items()}
    blockers = []
    if actual_period != target_period:
        blockers.append('requested_month_not_in_observed_feed')
    if values['revenue'] is None:
        blockers.append('current_revenue_missing')
    comparisons = [('mom', 'revenue', 'prior_month'), ('yoy', 'revenue', 'prior_year_month'), ('ytd_yoy', 'ytd', 'prior_year_ytd')]
    arithmetic = {}
    for key, current, prior in comparisons:
        a, b = values[current], values[prior]
        calculated = (a / b - 1) * 100 if a is not None and b is not None and b > 0 else None
        agrees = abs(calculated - rates[key]) <= Decimal('.02') if calculated is not None and rates[key] is not None else None
        arithmetic[key] = {'calculated_percent': str(calculated) if calculated is not None else None, 'reported_rate_agrees': agrees}
        if agrees is False:
            blockers.append('reported_' + key + '_arithmetic_mismatch')
    return {'period': actual_period, 'table_date_raw': row.get('出表日期'), 'issuer_name_raw': row['公司名稱'],
            'amount_unit': 'NTD_thousands', 'amount_unit_status': 'MOPS_monthly_revenue_table_convention',
            'amounts': {key: str(value) if value is not None else None for key, value in values.items()},
            'reported_percent': {key: str(value) if value is not None else None for key, value in rates.items()},
            'arithmetic_checks': arithmetic, 'blockers': blockers,
            'negative_amount_observed': any(value is not None and value < 0 for value in values.values()),
            'issuer_publication_time_verified': False, 'accounting_validation_receipt_available': False}


def escaped(value):
    return str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('|', '\\|').replace('\n', ' ')


def brief(card, row, source, identity_ok, target_period):
    facts = project_row(row, target_period) if row is not None else None
    blockers = list(facts['blockers']) if facts else ['official_revenue_row_unavailable']
    if not identity_ok:
        blockers.append('official_company_identity_unverified')
    result = {'symbol': card['symbol'], 'name': card['name'], 'facts': facts, 'source_id': source,
              'status': 'factual_brief_complete' if not blockers else 'blocked_evidence_gap', 'blockers': blockers,
              'publish_allowed': False, 'editorial_acceptance': False, 'production_written': False,
              'current_entry_plan': None, 'historical_strategy_evidence': False}
    lines = [f"# {escaped(card['symbol'])} {escaped(card['name'])}｜{target_period} 月營收證據簡報", '',
             f"處理狀態：`{result['status']}`。這是公開財務數字的原創摘要，不是完整估值報告或進場建議。", '']
    if facts:
        lines += [f"官方資料列屬 {facts['period']}，出表日期原值為 `{escaped(facts['table_date_raw'])}`；出表日不是個別公司的公告時間。", '',
                  '金額依 MOPS 月營收表慣例保留為新台幣千元，不將營收當成每股盈餘。', '', '| 項目 | 原始數值（新台幣千元） |', '|---|---:|']
        for key, label in [('revenue', '當月營收'), ('prior_month', '上月營收'), ('prior_year_month', '去年同月營收'), ('ytd', '本年累計營收'), ('prior_year_ytd', '去年同期累計營收')]:
            lines.append(f"| {label} | {facts['amounts'][key] if facts['amounts'][key] is not None else '未提供'} |")
        lines += ['', '## 數字如何解讀', '']
        for key, label in [('mom', '月增率'), ('yoy', '年增率'), ('ytd_yoy', '累計年增率')]:
            rate = facts['reported_percent'][key]; check = facts['arithmetic_checks'][key]['reported_rate_agrees']
            lines.append(f"{label}公告欄位：{rate + '%' if rate is not None else '未提供'}。算術核對：{'相符' if check is True else '不相符，不能據此下結論' if check is False else '分母不適用或缺資料，未核定'}。")
        if not blockers and all(facts['arithmetic_checks'][key]['reported_rate_agrees'] for key in ('yoy', 'ytd_yoy')):
            yoy, ytd = (Decimal(facts['reported_percent'][key]) for key in ('yoy', 'ytd_yoy'))
            relation = '高於' if yoy > ytd else '低於' if yoy < ytd else '等於'
            lines += ['', f"當月年增率{relation}累計年增率。這只是相同公司兩種期間比較；不能僅由一個月的差異認定成長加速、訂單落地或趨勢反轉。"]
        if facts['negative_amount_observed']:
            lines += ['', '資料含負營收／負比較基期，須查原申報更正或沖回原因；此處保留原值，不改為零。']
    else:
        lines += ['沒有取得符合本次來源的營收資料列，不以新聞索引或空白補成數字。']
    lines += ['', '## 尚不能回答的投資問題', '',
              '這份表沒有產品／客戶收入占比、毛利率、營業費用、現金流、稀釋股數及訂單驗證，不能用營收乘任意倍數推導 EPS、目標價或勝率。金融業等不同業別的營收定義也不宜直接橫比。',
              '下一步應核對公司法說與季度報表，區分出貨量、售價、匯率、併購及一次性認列；沒有相關文件時，只能保留問題而不能指定原因。', '',
              '本稿尚未取得正式候選當前 revision、財務驗證收據與逐篇發布驗收，未匯入正式文章。']
    if blockers:
        lines += ['', '證據缺口：' + '、'.join('`' + value + '`' for value in blockers) + '。']
    if source:
        url, listing = SOURCES[source]
        lines += ['', '## 來源與授權', '', f'原始資料：{url}', f'資料集及欄位：{listing}',
                  '提供：金融監督管理委員會證券期貨局／交易所；政府資料開放授權條款第1版。保留資料擷取與原檔雜湊於 manifest；這是轉換後的摘要，不是機關背書。']
    return result, '\n'.join(lines) + '\n'


def run(cards_path, identity_path, identity_sha256, output, target_period='2026-08', get=fetch):
    raw_cards = Path(cards_path).read_bytes(); raw_ids = Path(identity_path).read_bytes()
    if sha(raw_cards) != CARDS_SHA256 or sha(raw_ids) != identity_sha256:
        raise ValueError('editorial_input_hash_mismatch')
    cards = list(csv.DictReader(io.StringIO(raw_cards.decode('utf-8')))); identity = json.loads(raw_ids)
    if len(cards) != 176 or len({c['symbol'] for c in cards}) != 176 or identity.get('schema') != 'stockinsider-official-company-identity-audit-v1':
        raise ValueError('editorial_identity_scope_invalid')
    identity_rows = identity.get('identities', [])
    if len(identity_rows) != 176 or {c['symbol'] for c in cards} != {r['symbol'] for r in identity_rows}:
        raise ValueError('editorial_identity_cardinality_mismatch')
    identities = {row['symbol']: row for row in identity_rows}
    out = Path(output); out.mkdir(parents=True, exist_ok=False); (out / 'sources').mkdir(); (out / 'briefs').mkdir()
    receipts, tables, results = [], {}, []
    for market, (url, listing) in SOURCES.items():
        receipt = {'id': market, 'url': url, 'metadata_url': listing, 'observed_at': datetime.now(timezone.utc).isoformat(), 'status': 'unavailable'}
        try:
            raw = get(url); receipt.update(bytes=len(raw), sha256=sha(raw)); (out / 'sources' / (market + '.csv')).write_bytes(raw)
            tables[market] = parse_csv(raw); receipt['status'] = 'parsed'
        except (OSError, ValueError, UnicodeError, csv.Error) as exc:
            receipt['error_class'] = type(exc).__name__
        receipts.append(receipt)
    for card in cards:
        item = identities[card['symbol']]; matches = item.get('official_matches', [])
        identity_ok = item.get('status') == 'official_company_match' and item.get('name_matches_exactly') is True and len(matches) == 1
        market = matches[0].get('market') if identity_ok else None
        row = tables.get(market, {}).get(card['symbol'])
        try:
            result, text = brief(card, row, market, identity_ok, target_period)
        except (ValueError, KeyError, InvalidOperation) as exc:
            result, text = brief(card, None, market, identity_ok, target_period)
            result['blockers'].append('invalid_financial_row:' + type(exc).__name__)
        (out / 'briefs' / (card['symbol'] + '.md')).write_text(text, encoding='utf-8')
        results.append(result)
    manifest = {'schema': 'current-revenue-editorial-batch-v1', 'target_period': target_period,
                'cards_sha256': CARDS_SHA256, 'identity_sha256': identity_sha256, 'sources': receipts,
                'records': results, 'brief_count': len(results), 'factual_briefs_complete': sum(r['status'] == 'factual_brief_complete' for r in results),
                'published_articles': 0, 'production_written': False, 'strategy_holdout_accessed': False,
                'source_scope': 'current_editorial_only_not_backtest_inputs', 'license': 'Taiwan Government Data Open License v1.0'}
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cards', required=True, type=Path); parser.add_argument('--identities', required=True, type=Path)
    parser.add_argument('--identity-sha256', required=True); parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    result = run(args.cards, args.identities, args.identity_sha256, args.output)
    print(json.dumps({key: result[key] for key in ('brief_count', 'factual_briefs_complete', 'published_articles', 'production_written')}))

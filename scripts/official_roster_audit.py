"""At most four bounded public official-company reads; validate supplied cards, never nominate.

Company-master matches are not historical universe, current price, security-type,
publication or trading authority. No raw officer/contact fields are retained.
"""
from __future__ import annotations
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

SOURCES = {'TWSE': 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
           'TPEX': 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O'}
CSV_SOURCES = {'TWSE': 'https://mopsfin.twse.com.tw/opendata/t187ap03_L.csv',
               'TPEX': 'https://mopsfin.twse.com.tw/opendata/t187ap03_O.csv'}
# Direct CSV URLs are linked by data.gov.tw/dataset/18419 and /25036.
MAX_BYTES = 8 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('official_master_redirect_rejected')


def fetch_source(url):
    if url not in (*SOURCES.values(), *CSV_SOURCES.values()):
        raise ValueError('official_source_not_allowlisted')
    request = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'StockInsider-public-identity-audit/1'}, method='GET')
    with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=20) as response:
        if response.status != 200 or response.url != url:
            raise ValueError('official_transport_mismatch')
        raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('official_response_size_bound')
        return raw


def parse_master(raw, *, csv_mode=False):
    if csv_mode:
        text = raw.decode('utf-8-sig') if isinstance(raw, bytes) else raw
        reader = csv.DictReader(io.StringIO(text), strict=True)
        if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError('official_csv_header_invalid')
        rows = list(reader)
    else:
        def pairs(items):
            value = {}
            for key, item in items:
                if key in value:
                    raise ValueError('official_json_duplicate_key')
                value[key] = item
            return value
        def constant(_):
            raise ValueError('official_json_nonfinite')
        rows = json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)
    if not isinstance(rows, list) or not 1 <= len(rows) <= 5000:
        raise ValueError('official_master_shape')
    result = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('official_master_row')
        symbol = str(row.get('公司代號', row.get('SecuritiesCompanyCode', ''))).strip()
        name = row.get('公司簡稱', row.get('CompanyAbbreviation'))
        # The official issuer feed also has non-four-digit company identifiers.
        # Filter those known identifiers without discarding the entire valid feed.
        if re.fullmatch('[0-9]{5,6}', symbol):
            continue
        if not re.fullmatch('[0-9]{4}', symbol) or not isinstance(name, str) or not 0 < len(name.strip()) <= 256:
            raise ValueError('official_master_identity')
        if any(ord(c) < 32 for c in name):
            raise ValueError('official_master_name_control_character')
        if symbol in result:
            raise ValueError('official_master_duplicate_symbol')
        result[symbol] = {'company_short_name': name.strip(),
                          'source_table_date': row.get('出表日期', row.get('Date')),
                          'listing_date': row.get('上市日期', row.get('上櫃日期', row.get('DateOfListing')))}
    if not result:
        raise ValueError('official_four_digit_roster_empty')
    return result


def audit(cards, fetch=fetch_source):
    if not isinstance(cards, list) or not 1 <= len(cards) <= 5000:
        raise ValueError('card_bound')
    if any(not re.fullmatch('[0-9]{4}', str(c.get('symbol', ''))) for c in cards) or len({c['symbol'] for c in cards}) != len(cards):
        raise ValueError('card_identity_or_duplicate')
    acquired = datetime.now(timezone.utc).isoformat()
    receipts, masters = [], {}
    for market in SOURCES:
        for url in (SOURCES[market], CSV_SOURCES[market]):
            receipt = {'market': market, 'url': url, 'method': 'GET', 'observed_at': datetime.now(timezone.utc).isoformat()}
            try:
                raw = fetch(url)
                receipt.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
                masters[market] = parse_master(raw, csv_mode=url.endswith('.csv'))
                receipt.update(status='parsed', record_count=len(masters[market]))
            except (OSError, ValueError, UnicodeError, TypeError, csv.Error) as exc:
                receipt.update(status='unavailable', error_class=type(exc).__name__)
                if isinstance(exc, json.JSONDecodeError):
                    receipt.update(json_error_line=exc.lineno, json_error_column=exc.colno,
                                   json_error_position=exc.pos)
                elif isinstance(exc, ValueError) and str(exc).startswith('official_'):
                    receipt['reason'] = str(exc)
            receipts.append(receipt)
            if market in masters:
                break
    identities = []
    for card in sorted(cards, key=lambda c: c['symbol']):
        matches = [{'market': market, **records[card['symbol']]} for market, records in masters.items() if card['symbol'] in records]
        status = ('official_company_match' if len(matches) == 1 else 'conflicting_official_matches' if len(matches) > 1
                  else 'not_in_observed_listed_company_feeds' if len(masters) == 2 else 'unresolved_source_unavailable')
        identities.append({'symbol': card['symbol'], 'observed_name': card.get('name'),
                           'status': status, 'official_matches': matches,
                           'name_matches_exactly': len(matches) == 1 and card.get('name') == matches[0]['company_short_name'],
                           'automatic_correction': False, 'security_type_verified': False})
    return {'schema': 'stockinsider-official-company-identity-audit-v1', 'observed_at': acquired,
            'scope': 'supplied_public_cards_only', 'candidates_count': len(cards), 'source_receipts': receipts,
            'identities': identities, 'production_written': False, 'publish_allowed': False,
            'historical_universe_verified': False, 'authority_snapshot_available': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cards', type=Path, required=True)
    parser.add_argument('--cards-sha256', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raw = args.cards.read_bytes()
    if len(raw) > MAX_BYTES or hashlib.sha256(raw).hexdigest() != args.cards_sha256:
        raise ValueError('public_card_source_hash_mismatch')
    cards = list(csv.DictReader(io.StringIO(raw.decode('utf-8'))))
    with args.output.open('x', encoding='utf-8') as stream:
        result = audit(cards)
        stream.write(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'cards': len(cards), 'official_matches': sum(x['status'] == 'official_company_match' for x in result['identities']),
                      'production_written': False}))


if __name__ == '__main__':
    main()

"""Bounded unauthenticated GET audit of the existing public daily stage pages.

Never reads a DB, dossier bundle, broker feed, historical bars or internal API.
A complete public projection is NOT a complete/current authoritative universe.
No full article bodies, tokens, response cookies or recommendation prices persist.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

BASE = 'https://stockinsider-three.vercel.app/api/radar/daily'
ORIGINS = {'https://stockinsider-three.vercel.app', 'http://5.104.83.211'}
STAGES = ('found', 'waiting', 'actionable')
LIMIT = 40
MAX_BYTES = 2 * 1024 * 1024
MAX_REQUESTS = 16
MAX_SECONDS = 120


def stamp():
    return datetime.now(timezone.utc).isoformat()


def allowed_url(url):
    try:
        parts = urlsplit(url)
        return (not parts.username and not parts.password and not parts.fragment
                and f'{parts.scheme}://{parts.netloc}' in ORIGINS
                and parts.path == '/api/radar/daily')
    except ValueError:
        return False


class PublicOnlyRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed_url(newurl):
            raise ValueError('redirect_outside_frozen_public_daily_surface')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def strict_json(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise ValueError('duplicate_json_key')
            value[key] = item
        return value
    def nonfinite(_):
        raise ValueError('nonfinite_json')
    return json.loads(raw, parse_constant=nonfinite, object_pairs_hook=pairs)


def public_get(url, timeout=15):
    if not allowed_url(url):
        raise ValueError('request_outside_frozen_public_daily_surface')
    # Ignore environment proxy credentials and never install a cookie handler.
    opener = build_opener(ProxyHandler({}), PublicOnlyRedirect())
    request = Request(url, method='GET', headers={
        'Accept': 'application/json', 'User-Agent': 'StockInsider-public-readonly-audit/1'})
    with opener.open(request, timeout=timeout) as response:
        if not allowed_url(response.url):
            raise ValueError('response_outside_frozen_public_daily_surface')
        raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('public_response_size_bound')
        body = strict_json(raw)
        if not isinstance(body, dict):
            raise ValueError('public_response_shape')
        return body, {'final_url': response.url, 'http_status': response.status,
                      'response_bytes': len(raw), 'response_sha256': hashlib.sha256(raw).hexdigest(),
                      'transport_authenticated': response.url.startswith('https://')}


def bounded_count(value):
    return type(value) is int and 0 <= value <= 5000


def observe(fetch=public_get, *, pause=time.sleep, monotonic=time.monotonic):
    started = monotonic()
    receipts, blockers, candidates = [], [], {}
    public_complete = False
    expected = None
    publication = None
    content_as_of = None
    projection = {}
    stages_done = []

    def get(url):
        if len(receipts) >= MAX_REQUESTS or monotonic() - started >= MAX_SECONDS:
            raise ValueError('public_acquisition_budget_exhausted')
        if receipts:
            pause(1)
        receipt = {'source_url': url, 'observed_at': stamp(), 'request_method': 'GET', 'authenticated': False}
        receipts.append(receipt)
        try:
            body, meta = fetch(url, timeout=max(1, min(15, MAX_SECONDS - (monotonic() - started))))
            receipt.update(meta)
            return body
        except Exception as exc:
            receipt['error_class'] = type(exc).__name__
            if isinstance(exc, HTTPError):
                receipt['http_status'] = exc.code
            # Network failure is not an empty roster; don't persist arbitrary exception text.
            raise ValueError('public_read_unavailable') from exc

    def retain(items, surface):
        if not isinstance(items, list) or len(items) > LIMIT:
            raise ValueError('public_page_items_invalid')
        for row in items:
            if not isinstance(row, dict) or not isinstance(row.get('symbol'), str) or not re.fullmatch(r'[0-9]{4}', row['symbol']):
                raise ValueError('public_card_identity_invalid')
            symbol = row['symbol']
            name = row.get('chineseName', row.get('name'))
            revision = row.get('detailRevisionId')
            if not isinstance(name, str) or not 0 < len(name) <= 256 or any(ord(c) < 32 for c in name):
                raise ValueError('public_card_name_invalid')
            if revision is not None and (not isinstance(revision, str) or not 0 < len(revision) <= 256):
                raise ValueError('public_card_revision_invalid')
            prior = candidates.get(symbol)
            if prior and (prior['name'] != name or prior['revision'] != revision):
                raise ValueError('public_card_revision_drift')
            if prior and surface not in prior['observed_surfaces']:
                prior['observed_surfaces'].append(surface)
            elif not prior:
                candidates[symbol] = {'symbol': symbol, 'name': name, 'revision': revision,
                    'revision_scope': 'public_card_detail_revision_only_not_verified_current_database_revision',
                    'observed_at': stamp(), 'observed_surfaces': [surface], 'source_url': BASE}

    try:
        daily = get(BASE)
        counts = daily.get('stageCounts')
        if not isinstance(counts, dict) or any(not bounded_count(counts.get(stage)) for stage in STAGES):
            raise ValueError('public_stage_counts_invalid')
        expected = sum(counts[stage] for stage in STAGES)
        if expected > 5000:
            raise ValueError('public_roster_bound')
        publication = daily.get('snapshotPublishedAt')
        if not isinstance(publication, str) or not publication:
            raise ValueError('public_snapshot_identity_missing')
        raw_projection = daily.get('projectionHealth', {})
        projection = {key: raw_projection.get(key) for key in (
            'status', 'contentAsOf', 'freshnessStatus', 'integrityStatus', 'researchVisibility',
            'acquisitionAuthority', 'actionAuthority')} if isinstance(raw_projection, dict) else {}
        content_as_of = projection.get('contentAsOf') or daily.get('asOf')
        if daily.get('snapshotStale') is not False or projection.get('freshnessStatus') != 'fresh':
            blockers.append('public_projection_not_verified_fresh')
        initial = daily.get('stages', {})
        for stage in STAGES:
            if isinstance(initial, dict) and stage in initial:
                retain(initial[stage], 'daily.' + stage)
        all_page_symbols = set()
        for stage in STAGES:
            seen, offset = set(), 0
            while True:
                url = BASE + '?' + urlencode({'stage': stage, 'offset': offset, 'limit': LIMIT, 'snapshotPublishedAt': publication})
                page = get(url)
                if (page.get('schemaVersion') != 'radar-stage-page-v1' or page.get('stage') != stage
                        or type(page.get('offset')) is not int or page['offset'] != offset
                        or type(page.get('limit')) is not int or page['limit'] != LIMIT
                        or type(page.get('total')) is not int or page['total'] != counts[stage]
                        or page.get('snapshotPublishedAt') != publication):
                    raise ValueError('public_page_identity_or_snapshot_drift')
                items = page.get('items')
                if not isinstance(items, list) or len(items) > LIMIT:
                    raise ValueError('public_page_items_invalid')
                keys = [row.get('symbol') if isinstance(row, dict) else None for row in items]
                if any(not isinstance(key, str) for key in keys) or len(set(keys)) != len(keys) or seen.intersection(keys):
                    raise ValueError('public_page_duplicate_or_invalid_symbol')
                consumed = offset + len(items)
                if consumed > counts[stage] or (consumed < counts[stage] and not items):
                    raise ValueError('public_page_incomplete')
                next_offset = consumed if consumed < counts[stage] else None
                if page.get('nextOffset') != next_offset or (next_offset is not None and type(page.get('nextOffset')) is not int):
                    raise ValueError('public_page_cursor_invalid')
                retain(items, 'stage.' + stage)
                seen.update(keys)
                if next_offset is None:
                    break
                offset = next_offset
            if len(seen) != counts[stage] or all_page_symbols.intersection(seen):
                raise ValueError('public_stage_cardinality_or_overlap')
            all_page_symbols.update(seen)
            stages_done.append(stage)
        if set(candidates) != all_page_symbols:
            raise ValueError('daily_cards_do_not_match_paginated_roster')
        public_complete = len(all_page_symbols) == expected
    except (ValueError, TypeError, KeyError, RecursionError) as exc:
        blockers.append(str(exc) if isinstance(exc, ValueError) else type(exc).__name__)
    blockers += ['authoritative_candidate_snapshot_not_available', 'public_security_master_authority_not_supplied']
    if not public_complete:
        blockers.append('public_stage_pagination_incomplete')
    return {'schema_version': 'stockinsider-public-roster-observation-v2', 'as_of': stamp(),
        'scope': 'bounded_public_card_observation_only', 'complete': False,
        'authoritative_snapshot_available': False, 'full_app_coverage_verified': False,
        'expected_count': expected, 'observed_unique_count': len(candidates),
        'public_stage_coverage_complete': public_complete, 'validated_stages': stages_done,
        'source_content_as_of': content_as_of, 'snapshot_published_at': publication,
        'source_projection_status': projection, 'blockers': sorted(set(blockers)),
        'candidates': [candidates[key] for key in sorted(candidates)], 'surface_observations': receipts,
        'production_updated': False, 'articles_published': 0, 'holdout_research_accessed': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    # Reserve a new path BEFORE network activity, never overwrite prior evidence.
    with args.output.open('x', encoding='utf-8') as stream:
        result = observe()
        stream.write(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + '\n')
    print(json.dumps({key: result[key] for key in (
        'observed_unique_count', 'expected_count', 'public_stage_coverage_complete', 'blockers')}))


if __name__ == '__main__':
    main()

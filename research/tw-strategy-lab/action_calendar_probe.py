"""One fixed official 2023 calendar GET to diagnose a closed-day action mismatch.

No normalization rewrite, date inference, simulation, DB or publication. The
original dataset stays immutable. New responses are observations made now.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler

URLS = {
    'closed_calendar_2023_date_parameter': 'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date=20230101',
}
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('unapproved_redirect')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    out = parser.parse_args().output
    out.mkdir(parents=True, exist_ok=False)
    receipts = []
    for name, url in URLS.items():
        record = {'id': name, 'url': url, 'observed_at': datetime.now(timezone.utc).isoformat()}
        try:
            request = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'StockInsider-2023-action-diagnostic/1'})
            with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=20) as response:
                raw = response.read(1024 * 1024 + 1)
                if response.status != 200 or response.url != url or len(raw) > 1024 * 1024:
                    raise ValueError('bounded_official_transport_failed')
            value = json.loads(raw)
            if not isinstance(value, dict): raise ValueError('response_shape')
            if value.get('date') != '20230101' or value.get('queryYear') != 2023:
                raise ValueError('calendar_year_mismatch')
            rows = value.get('data')
            if not isinstance(rows, list) or len(rows) < 10 or any(not isinstance(row, list) or not row or not str(row[0]).startswith('2023-') for row in rows):
                raise ValueError('calendar_rows_mismatch')
            record['calendar_year_admitted'] = True
            (out / (name + '.json')).write_bytes(raw)
            record.update(status='raw_official_response_retained_not_effective_date_approval',
                          sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
        except Exception as exc:
            record.update(status='unavailable', error_class=type(exc).__name__)
        receipts.append(record)
        time.sleep(2)
    (out / 'receipts.json').write_text(json.dumps({'schema':'official-action-calendar-probe-v1','receipts':receipts,
        'automatic_date_shift':False,'original_dataset_modified':False,'simulations':0,'production_written':False}, ensure_ascii=False, indent=2)+'\n')

if __name__ == '__main__':
    main()

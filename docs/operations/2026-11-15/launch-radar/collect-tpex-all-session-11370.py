import csv
import hashlib
import io
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = Path('/var/tmp/stockinsider-launch-official-e4bd698-replay/work')
OUTPUT = BASE / 'open-11370'
HEADER = ('資料日期,代號,名稱,收盤,漲跌,開盤,最高,最低,均價,成交股數,成交金額,'
          '成交筆數,最後買價,最後賣價,發行股數,次日參考價,次日漲停價,次日跌停價').split(',')
SYMBOLS = ('5274', '6488')
MAX_BYTES = 3 * 1024 * 1024
MAX_ROWS = 20000

def current_time():
    return datetime.now(timezone.utc).isoformat()

def capture(session):
    url = ('https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?' +
           urlencode({'date': session.replace('-', '/'), 'response': 'data', 'type': 'DailyClose'}))
    with urlopen(Request(url, headers={'User-Agent': 'StockInsider-staging-source-check/1.0'}), timeout=15) as response:
        assert response.status == 200 and response.geturl() == url
        body = response.read(MAX_BYTES + 1)
        media = response.headers.get('Content-Type')
    observed = current_time()
    assert 0 < len(body) <= MAX_BYTES and media.lower().startswith('application/csv')
    records = csv.reader(io.StringIO(body.decode('utf-8-sig')))
    assert next(records) == HEADER
    dates, matches = set(), {}
    count = 0
    for row in records:
        count += 1
        assert len(row) == len(HEADER) and count <= MAX_ROWS
        dates.add(row[0])
        if row[1] in SYMBOLS:
            assert row[1] not in matches
            values = [int(row[column].replace(',', '')) for column in (9, 10, 14)]
            assert all(value > 0 for value in values)
            matches[row[1]] = dict(zip(('allSessionTradeShares', 'allSessionTurnoverNtd', 'issuedShares'), values))
    expected = str(int(session[:4]) - 1911) + session[5:7] + session[8:10]
    assert dates == {expected} and set(matches) == set(SYMBOLS)
    filename = 'bodies/' + session + '.csv'
    with (OUTPUT / filename).open('xb') as destination:
        destination.write(body)
    return {'datasetId': 11370, 'session': session, 'sourceUrl': url, 'file': filename,
            'observedAt': observed, 'publisherPublishedAt': None, 'httpStatus': 200,
            'redirectCount': 0, 'contentType': media, 'bytes': len(body), 'rows': count,
            'rawSha256': hashlib.sha256(body).hexdigest(), 'matches': matches}

if __name__ == '__main__':
    os.umask(0o077)
    manifest = json.loads((BASE / 'open-licensed' / 'host-capture.json').read_bytes())
    sessions = sorted({row['requestKey'] for row in manifest['responses'] if row['datasetId'] == 11856})
    assert len(sessions) == 21 and sessions[0] == '2026-10-14' and sessions[-1] == '2026-11-13'
    (OUTPUT / 'bodies').mkdir(mode=0o700)
    start = current_time()
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(capture, sessions))
    end = current_time()
    with (OUTPUT / 'host-capture.json').open('x', encoding='utf-8') as file:
        json.dump({'startedAt': start, 'completedAt': end,
                   'captureScriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                   'responses': responses}, file, ensure_ascii=False)
    print(json.dumps({'days': len(responses), 'bytes': sum(row['bytes'] for row in responses),
                      'maxPageBytes': max(row['bytes'] for row in responses),
                      'maxPageRows': max(row['rows'] for row in responses),
                      'startedAt': start, 'completedAt': end}))


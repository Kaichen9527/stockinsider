import csv, datetime as dt, hashlib, io, json, os, pathlib, re, shutil, tempfile
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from urllib.parse import urlencode
from urllib.request import build_opener, HTTPRedirectHandler, Request
from urllib.error import HTTPError, URLError

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def write(name, body):
    fd = os.open(root / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(body)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def parse_date(value):
    match = re.fullmatch(r'([0-9]{3,4})[/-]?([0-9]{2})[/-]?([0-9]{2})', value.strip())
    if not match:
        raise ValueError('DATE_SHAPE')
    yr, mo, day = map(int, match.groups())
    return dt.date(yr + 1911 if yr < 1911 else yr, mo, day)

def parse_bar(row):
    raw = [v.strip() for v in row[1:5]]
    if any(len(v)>32 or not re.fullmatch(r'(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?', v) for v in raw):
        raise ValueError('PRICE_SHAPE')
    op, high, low, close = (Decimal(v.replace(',', '')) for v in raw)
    if not(0 < low <= min(op,close) <= max(op,close) <= high <= 9007199254740991):
        raise ValueError('PRICE_RELATION')
    return close

headers = {11755: ['日期','開盤指數','最高指數','最低指數','收盤指數'], 11391: ['資料日期','開市','最高價','最低價','收市','漲跌']}
venues = {11755:'TWSE', 11391:'TPEX'}
keys = [f'{year}-{month:02d}' for year in range(2024,2027) for month in range(1,13)
        if '2024-08' <= f'{year}-{month:02d}' <= '2026-11']
last = dt.date(2026,11,13)
minimum = 15 * 1024**3
free = shutil.disk_usage('/var/tmp').free
mem = int(next(line.split()[1] for line in open('/proc/meminfo') if line.startswith('MemAvailable:'))) * 1024
assert os.getuid()!=0 and free >= minimum+4*1024**2 and mem>=int(1.5*1024**3)
root = pathlib.Path(tempfile.mkdtemp(prefix='stockinsider-launch-index-520-', dir='/var/tmp'))
start = utc()

def collect(dataset):
    points = {}
    observations = []
    for key in keys:
        twse = dataset == 11755
        qry = urlencode({'response':'open_data','date':key.replace('-','')+'01'} if twse
                        else {'response':'data','date':key.replace('-','/')+'/01'})
        url = ('https://www.twse.com.tw/indicesReport/MI_5MINS_HIST?' if twse
               else 'https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?') + qry
        result = {'datasetId':dataset,'venue':venues[dataset],'requestMonth':key,'url':url}
        try:
            request = Request(url, headers={'User-Agent':'StockInsider/official-open-data-verification',
                                            'Accept':'text/csv','Accept-Encoding':'identity'})
            with build_opener(NoRedirect).open(request,timeout=13) as response:
                raw = response.read(65537)
                result.update(httpStatus=response.status,observedAt=utc(),bytes=len(raw),sha256=sha(raw))
                mime = response.headers.get('Content-Type','')
                result['mime'] = mime
                if response.url!=url or response.status!=200 or 'csv' not in mime.lower() or len(raw)>65536:
                    raise ValueError('TRANSPORT')
            write(f'{dataset}-{key}.csv',raw)
            rows = list(csv.reader(io.StringIO(raw.decode('utf-8-sig'),newline=''), strict=True))
            if len(rows) not in range(2,33) or rows[0]!=headers[dataset] or any(len(row)!=len(rows[0]) for row in rows[1:]):
                raise ValueError('HEADER_WIDTH_OR_ROW_BOUND')
            month = {}
            for row in rows[1:]:
                day = parse_date(row[0])
                close = parse_bar(row)
                if day.isoformat()[:7] != key or day>last or day in month:
                    raise ValueError('SESSION_SCOPE')
                month[day] = close
            points.update(month)
            result.update(count=len(month),first=min(month).isoformat(),last=max(month).isoformat(),status='OBSERVED')
        except HTTPError as e:
            result.update(status='HTTP_ERROR',httpStatus=e.code)
        except (ValueError, csv.Error, URLError, OSError) as e:
            reason = str(e)
            closed = {'DATE_SHAPE','PRICE_SHAPE','PRICE_RELATION','TRANSPORT','HEADER_WIDTH_OR_ROW_BOUND','SESSION_SCOPE'}
            result.update(status=reason if reason in closed else type(e).__name__)
        observations.append(result)
    return points, observations

with ThreadPoolExecutor(max_workers=2) as pool:
    twse, tpex = pool.map(collect, (11755,11391))
common = sorted(twse[0].keys() & tpex[0].keys())
recent = common[-520:]
planner = common[-240:]
planned_keys = set(d.isoformat()[:7] for d in planner)
covered = [d for d in recent if d.isoformat()[:7] in planned_keys]
stats = {'sourceObservationStartedAt':start,'allSourceObservationsRecordedBy':utc(),
         'throughSession':last.isoformat(),'sourceResponses':twse[1]+tpex[1],
         'coverage':{'observedByMarket':{'TWSE':len(twse[0]),'TPEX':len(tpex[0])},'common':len(common),
                     'firstCommon':common[0].isoformat() if common else None,'lastCommon':common[-1].isoformat() if common else None,
                     'onlyTWSE':[d.isoformat() for d in sorted(twse[0].keys()-tpex[0].keys())],
                     'onlyTPEX':[d.isoformat() for d in sorted(tpex[0].keys()-twse[0].keys())]},
         'plannerComparison':{'requestedWindow':520,'observedWindowCount':len(recent),'observedWindowStart':recent[0].isoformat() if recent else None,
                              'monthlyKeysNeededForObservedWindow':len({d.isoformat()[:7] for d in recent}),
                              'plannerNewestSessions':240,'plannerMonthlyKeys':len(planned_keys),'coveredOfWindow':len(covered),
                              'missingOfObservedWindow':len(recent)-len(covered)},
         'capacity':{'freeDiskBefore':free,'freeDiskAfter':shutil.disk_usage('/var/tmp').free,'availableMemoryBefore':mem},
         'marketSessionDigest':sha('\n'.join(d.isoformat() for d in recent).encode()),
         'scope':'PUBLIC_LICENSED_CSV_BACKFILL_CONTROL_NO_APPLICATION_DATABASE_OR_RANKING'}
write('capture-receipt.json',json.dumps(stats,ensure_ascii=False,indent=2).encode())
print(json.dumps({'receipt':stats,'privateStagingDirectory':str(root)},ensure_ascii=False))

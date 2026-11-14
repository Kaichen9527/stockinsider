
import datetime as dt,hashlib,json,os,pathlib,sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler,Request,build_opener
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def stamp():return dt.datetime.now(dt.timezone.utc).isoformat()
def write(path,data):
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:f.write(data)
root=pathlib.Path('/var/tmp/stockinsider-launch-official-e4bd698-replay/work/open-11371')
assert root.is_dir() and root.stat().st_mode&0o077==0
bodies=root/'bodies'
bodies.mkdir(mode=0o700)
sessions=json.loads(sys.argv[1])
assert len(sessions)==57 and sorted(set(sessions))==sessions
def capture(day):
    d=dt.date.fromisoformat(day)
    roc=f'{d.year-1911}/{d.month:02d}/{d.day:02d}'
    url='https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php?'+urlencode({'l':'zh-tw','o':'data','se':'EW','d':roc})
    try:
        with build_opener(NoRedirect).open(Request(url,headers={'User-Agent':'StockInsider/official-open-data-verification','Accept':'text/csv','Accept-Encoding':'identity'}),timeout=12) as r:
            data=r.read(750001)
            status=r.status;mime=r.headers.get('Content-Type')
            if r.url!=url or status!=200 or len(data)>750000 or not mime or 'csv' not in mime.lower():raise ValueError('transport_or_limit')
        observed=stamp()
        path=bodies/f'tpex-native-{day}.csv'
        write(path,data)
        return {'datasetId':11371,'requestKey':day,'sourceUrl':url,'rawSha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'contentType':mime,'httpStatus':status,'redirectCount':0,'observedAt':observed,'file':'bodies/'+path.name}
    except (OSError,ValueError) as error:
        return {'requestKey':day,'failure':type(error).__name__,'status':getattr(error,'code',None)}
started=stamp()
with ThreadPoolExecutor(max_workers=2) as pool:
    rows=list(pool.map(capture,sessions))
completed=stamp()
write(root/'host-capture.json',json.dumps({'startedAt':started,'completedAt':completed,'captureScriptSha256':sys.argv[2],'responses':rows}).encode())
print(json.dumps({'startedAt':started,'completedAt':completed,'captured':sum('file' in r for r in rows),'bytes':sum(r.get('bytes',0) for r in rows),'failures':[r for r in rows if 'failure'in r]}))



import csv,datetime as dt,hashlib,io,json,os,pathlib,re,sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError,URLError
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def checked_write(path, data):
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:f.write(data)
root=pathlib.Path('/var/tmp/stockinsider-launch-official-e4bd698-replay/work/open-licensed')
assert root.is_dir() and not root.is_symlink() and root.stat().st_mode&0o077==0
bodies=root/'bodies';bodies.mkdir(mode=0o700)
started=now()
def capture(task):
    dataset,key,url=task
    kind={11755:'twse-index',11391:'tpex-index',11856:'tpex-flow'}[dataset]
    out={'datasetId':dataset,'requestKey':key,'sourceUrl':url}
    try:
        req=Request(url,headers={'User-Agent':'StockInsider/official-open-data-verification','Accept':'text/csv','Accept-Encoding':'identity'})
        with build_opener(NoRedirect).open(req,timeout=12) as r:
            data=r.read(500001)
            status=r.status; mime=r.headers.get('Content-Type')
            assert r.url==url and status==200 and len(data)<=500000 and mime and 'csv' in mime.lower()
        observed=now()
        name=f'{kind}-{key}.csv'
        checked_write(bodies/name,data)
        return {**out,'rawSha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'contentType':mime,'httpStatus':status,'redirectCount':0,'observedAt':observed,'file':'bodies/'+name}
    except (HTTPError,URLError,TimeoutError,AssertionError) as e:
        return {**out,'error':type(e).__name__,'httpStatus':getattr(e,'code',None)}
tasks=[]
for m in range(1,12):
    key=f'2026-{m:02d}'
    tasks.extend([(11755,key,'https://www.twse.com.tw/indicesReport/MI_5MINS_HIST?'+urlencode({'response':'open_data','date':f'2026{m:02d}01'})),(11391,key,'https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?'+urlencode({'response':'data','date':f'2026/{m:02d}/01'}))])
for day in json.loads(sys.argv[1]):
    d=dt.date.fromisoformat(day)
    roc=f'{d.year-1911}/{d.month:02d}/{d.day:02d}'
    tasks.append((11856,day,'https://www.tpex.org.tw/web/stock/3insti/DAILY_TradE/3itrade_hedge_result.php?'+urlencode({'l':'zh-tw','o':'data','se':'EW','t':'D','d':roc})))
with ThreadPoolExecutor(max_workers=2) as pool:
    responses=list(pool.map(capture,tasks))
record={'startedAt':started,'completedAt':now(),'captureScriptSha256':sys.argv[2],'responses':responses}
checked_write(root/'host-capture.json',json.dumps(record,ensure_ascii=False).encode())
print(json.dumps({'startedAt':started,'completedAt':record['completedAt'],'captured':sum('file' in r for r in responses),'totalBytes':sum(r.get('bytes',0) for r in responses),'errors':[x for x in responses if 'error' in x]}))


import csv,datetime as dt,hashlib,io,json,re,urllib.request
from urllib.parse import urlencode
class RefuseRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def money(s):
    raw=s.strip()
    if not re.fullmatch(r'-?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)',raw):raise ValueError('INVALID_AMOUNT')
    return int(raw.replace(',',''))
base='https://www.tpex.org.tw/web/stock/3insti/3insti_SUMMARY/3itrdsum_result.php'
group={'combined':'外資及陸資合計','withoutForeignDealers':'外資及陸資(不含自營商)','foreignDealers':'外資自營商'}
expected=['資料日期','單位名稱','買進金額','賣出金額','買賣超']
rows=[]
for day in [6,9,10,11,12,13]:
    url=base+'?'+urlencode({'l':'zh-tw','o':'data','t':'D','d':f'115/11/{day:02d}'})
    req=urllib.request.Request(url,headers={'Accept':'text/csv','Accept-Encoding':'identity','User-Agent':'StockInsider/official-open-data-verification'})
    with urllib.request.build_opener(RefuseRedirect).open(req,timeout=12) as response:
        raw=response.read(32769);mime=response.headers.get('Content-Type','')
        if response.geturl()!=url or response.status!=200 or 'csv' not in mime.lower() or len(raw)>32768:raise ValueError('TRANSPORT_OR_SIZE')
        observed=dt.datetime.now(dt.timezone.utc).isoformat()
    reader=csv.DictReader(io.StringIO(raw.decode('utf-8-sig'),newline=''))
    if reader.fieldnames!=expected:raise ValueError('FIELDS')
    data={}
    for record in reader:
        if set(record)!=set(expected) or record['資料日期']!=f'11511{day:02d}':raise ValueError('SESSION')
        cat=record['單位名稱'].strip()
        if cat in data:raise ValueError('DUPLICATE_CATEGORY')
        buy,sell,net=(money(record[k]) for k in expected[2:])
        if min(buy,sell)<0 or buy-sell!=net:raise ValueError('AMOUNT_RELATION')
        data[cat]=net
    if len(data)!=8:raise ValueError('ROWS')
    total={k:data[v] for k,v in group.items()}
    if total['withoutForeignDealers']+total['foreignDealers']!=total['combined']:raise ValueError('CATEGORY_SUM')
    rows.append({'exchange':'TPEX','datasetId':11743,'session':f'2026-11-{day:02d}','url':url,'observedAt':observed,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'totalNetTwd':total})
windows={}
for end in (12,13):
    window=[row for row in rows if row['session']<=f'2026-11-{end}'][-5:]
    windows[f'2026-11-{end}']={'sessions':[r['session'] for r in window],'oneDayTwd':window[-1]['totalNetTwd'],'fiveDayTwd':{k:sum(r['totalNetTwd'][k] for r in window) for k in group}}
print(json.dumps({'sourceReceipts':rows,'throughWindows':windows},ensure_ascii=False))
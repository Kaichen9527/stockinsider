import csv,datetime as dt,hashlib,io,json,re,ssl,time,urllib.error,urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode

dates=("2026-11-06","2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13")
cut=256000
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def fetch(url):
    req=urllib.request.Request(url,headers={"User-Agent":"StockInsider/1.0 source-parity evaluation","Accept":"application/json, text/csv"})
    try:
        with urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context())).open(req,timeout=12) as r:
            body=r.read(cut+1)
            meta={"http":r.status,"mime":r.headers.get_content_type(),"responseClock":r.headers.get("Date")}
        if len(body)>cut:raise ValueError("response_size")
        meta.update(bytes=len(body),sha256=hashlib.sha256(body).hexdigest(),observedAt=dt.datetime.now(dt.timezone.utc).isoformat())
        return meta,body
    except urllib.error.HTTPError as e:
        return {"http":e.code,"observedAt":dt.datetime.now(dt.timezone.utc).isoformat()},None
def data_map(payload):
    keys=defaultdict(list)
    for item in payload:
        key=(item.get("date"),item.get("name"))
        if key[0] in dates and type(item.get("buy")) is int and type(item.get("sell")) is int:
            keys[key].append((item["buy"],item["sell"]))
    return keys
def vendor():
    url="https://api.finmindtrade.com/api/v4/data?"+urlencode({"dataset":"TaiwanStockTotalInstitutionalInvestors","start_date":dates[0],"end_date":dates[-1]})
    o,b=fetch(url)
    if not b:return {},o
    item=json.loads(b)
    rows=item.get("data",[])
    if isinstance(rows,list) and rows and all(isinstance(r,dict) for r in rows):
        o["rowCount"]=len(rows)
        o["observedKeys"]=sorted(set().union(*(r.keys() for r in rows)))
        o["uniqueDates"]=sorted({r["date"] for r in rows if isinstance(r.get("date"),str)})
        o["explicitVenueField"]=any(k in o["observedKeys"] for k in ("market","exchange","venue","type"))
        return data_map(rows),o
    return {},o
labelsTW={"Foreign_Investor":"外資及陸資(不含外資自營商)","Foreign_Dealer_Self":"外資自營商","Investment_Trust":"投信",
          "Dealer_self":"自營商(自行買賣)","Dealer_Hedging":"自營商(避險)"}
labelsOTC={"Foreign_Investor":"外資及陸資(不含自營商)","Foreign_Dealer_Self":"外資自營商","Investment_Trust":"投信",
           "Dealer_self":"自營商(自行買賣)","Dealer_Hedging":"自營商(避險)"}
def integer(v):return int(str(v).replace(",",""))
def official(it):
    venue,day=it
    if venue=="TWSE":
        url="https://www.twse.com.tw/rwd/zh/fund/BFI82U?"+urlencode({"dayDate":day.replace("-",""),"type":"day","response":"json"})
    else:
        y,m,d=map(int,day.split("-"))
        url="https://www.tpex.org.tw/web/stock/3insti/3insti_SUMMARY/3itrdsum_result.php?"+urlencode({"l":"zh-tw","o":"data","t":"D","d":f"{y-1911:03d}/{m:02d}/{d:02d}"})
    meta,raw=fetch(url)
    meta.update(venue=venue,requestedDate=day)
    if raw is None:return meta,{}
    try:
        if venue=="TWSE":
            j=json.loads(raw)
            y,m,d=map(int,day.split("-"))
            title=j["title"]
            originalDateCorrect=(j.get("date")==day.replace("-","") or re.search(fr"{y-1911}年0?{m}月0?{d}日",title) is not None)
            header=j["fields"];entries=j["data"]
            pick=[header.index(i) for i in ("單位名稱","買進金額","賣出金額","買賣差額")]
            categories=labelsTW
        else:
            rows=list(csv.reader(io.StringIO(raw.decode("utf-8-sig"),newline=""),strict=True))
            assert rows[0]==["資料日期","單位名稱","買進金額","賣出金額","買賣超"]
            y,m,d=map(int,day.split("-"))
            originalDateCorrect={t[0] for t in rows[1:] if len(t)==5}=={f"{y-1911:03d}{m:02d}{d:02d}"}
            entries=[x for x in rows[1:] if len(x)==5]
            pick=range(1,5)
            categories=labelsOTC
        result={}
        for row in entries:
            label,b,s,n=(row[x] for x in pick)
            label=re.sub(r"\s+","",label)
            for key,want in categories.items():
                if label==want:
                    assert key not in result
                    assert integer(b)-integer(s)==integer(n)
                    result[key]=(integer(b),integer(s))
        meta.update(sourceDateMatched=originalDateCorrect,arithmeticChecked=len(result))
        return meta,result if originalDateCorrect else {}
    except (AssertionError,KeyError,TypeError,ValueError,IndexError,csv.Error):
        return meta|{"profile":"unverified"},{}
def collect(venue):
    values={}
    observations=[]
    for day in dates:
        receipt,daily=official((venue,day))
        values[day]=daily
        observations.append(receipt)
        time.sleep(.35)
    return values,observations
with ThreadPoolExecutor(max_workers=3) as pool:
    fm=pool.submit(vendor)
    tw=pool.submit(collect,"TWSE")
    ot=pool.submit(collect,"TPEX")
    supplied,vendorEvidence=fm.result()
    officialTwse,twEvidence=tw.result()
    officialTpex,otEvidence=ot.result()
classifications=[]
for day in dates:
    for key in labelsTW:
        vendorValues=supplied.get((day,key),[])
        tw=officialTwse[day].get(key);ot=officialTpex[day].get(key)
        joint=tuple(a+b for a,b in zip(tw,ot)) if tw is not None and ot is not None else None
        value=vendorValues[0] if len(vendorValues)==1 else None
        classifications.append({"date":day,"category":key,"vendorRowCount":len(vendorValues),
          "matchesTwsePairs":value is not None and tw is not None and value==tw,
          "matchesTpexPairs":value is not None and ot is not None and value==ot,
          "matchesJointPairs":value is not None and joint is not None and value==joint,
          "twseNetMatch":value is not None and tw is not None and value[0]-value[1]==tw[0]-tw[1],
          "officialTwseEntryPresent":tw is not None,"officialTpexEntryPresent":ot is not None})
print(json.dumps({"finmind":vendorEvidence,"officialTwse":twEvidence,"officialTpex":otEvidence,"comparison":classifications,
 "credentialsUsed":False,"sourceDataRedistributed":False,"productionRightsProved":False,"officialExchangeOrRankingWritten":False}))

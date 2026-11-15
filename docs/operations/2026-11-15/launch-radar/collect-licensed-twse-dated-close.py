import csv,datetime as dt,hashlib,io,json,os,pathlib,re,shutil,ssl,sys,tempfile,time,urllib.error,urllib.request
from decimal import Decimal, InvalidOperation

BASE_URL="https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?response=open_data"
HEADER=["日期","證券代號","證券名稱","收盤價","殖利率(%)","股利年度","本益比","股價淨值比","財報年/季"]
MAX_BODY=256_000
RAW_BUDGET=5_000_000
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**k):return None

def positive_price(value):
    try:
        p=Decimal(value.replace(",",""))
        return p.is_finite() and p>0
    except InvalidOperation:
        return False

def check_day(day):
    source_date=dt.date.fromisoformat(day).strftime("%Y%m%d")
    url=BASE_URL+"&date="+source_date
    result={"datasetId":11764,"requestedSession":day,"url":url}
    try:
        op=urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
        request=urllib.request.Request(url,headers={"User-Agent":"StockInsider/1.0 licensed warmup scope verification","Accept":"text/csv"})
        with op.open(request,timeout=12) as f:
            result["httpStatus"]=f.status
            result["contentType"]=f.headers.get_content_type()
            result["sourceLastModified"]=f.headers.get("Last-Modified")
            raw=f.read(MAX_BODY+1)
        result["observedAt"]=dt.datetime.now(dt.timezone.utc).isoformat()
        result.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
        if result["httpStatus"]!=200 or result["contentType"]!="text/csv" or len(raw)>MAX_BODY:
            return result|{"profile":"HTTP_MIME_OR_SIZE"},None
        reader=csv.reader(io.StringIO(raw.decode("utf-8-sig"), newline=""),strict=True)
        header=next(reader,None)
        if header!=HEADER:return result|{"profile":"HEADER_MISMATCH"},None
        seen={}
        bodydates=set()
        for row in reader:
            if not any(row):continue
            if len(row)!=len(HEADER) or row[1] in seen or not row[1]:
                return result|{"profile":"RECORD_SHAPE"},None
            bodydates.add(row[0])
            seen[row[1]]=positive_price(row[3])
        if not seen:
            return result|{"profile":"EMPTY_BODY_NOT_SESSION_EVIDENCE","rowCount":0},None
        result["bodyDates"]=sorted(bodydates)
        if bodydates!={source_date}:
            return result|{"profile":"DATE_MISMATCH","rowCount":len(seen)},None
        return result|{"profile":"MATCHED_DATE","rowCount":len(seen),"positiveCloseCount":sum(seen.values())},raw
    except urllib.error.HTTPError as e:
        return result|{"profile":"HTTP_ERROR","httpStatus":e.code},None
    except (OSError,ValueError,csv.Error) as e:
        return result|{"profile":type(e).__name__},None

assert os.getuid()!=0 and shutil.disk_usage("/var/tmp").free>=15*1024**3+RAW_BUDGET
days=json.loads(sys.argv[1])
assert len(days)==31 and days==sorted(set(days))
os.umask(0o077)
root=pathlib.Path(tempfile.mkdtemp(prefix="stockinsider-twse-ma20-control-",dir="/var/tmp"))
sample_rows=[]
kept=0
for day in days:
    receipt,data=check_day(day)
    if data is not None:
        assert kept+len(data)<=RAW_BUDGET
        f=root/(day+".csv")
        with f.open("xb") as u:u.write(data)
        receipt["rawHashVerified"]=hashlib.sha256(f.read_bytes()).hexdigest()==receipt["sha256"]
        assert receipt["rawHashVerified"]
        kept+=len(data)
    sample_rows.append(receipt)
    time.sleep(.25)
closed,data=check_day("2026-10-23")
result={"schema":"stockinsider-licensed-listed-raw-close-range-v1","sourceRegistry":"https://data.gov.tw/dataset/11764",
 "targetSessions":["2026-11-12","2026-11-13"],"historicalSamples":sample_rows,
 "acceptedDays":sum(x["profile"]=="MATCHED_DATE" for x in sample_rows),
 "bytesRetained":kept,"closedDayNegativeControl":closed,
 "negativePayloadRetained":False,"companyActionAdjusted":False,"issueDateIsObservationDate":False,
 "kolOrRankingAuthority":False,"producerCalled":False}
(root/"receipt.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps({"privateStagingDirectory":str(root),"receipt":result}))

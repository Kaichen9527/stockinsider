import csv,datetime as dt,hashlib,io,json,pathlib,subprocess,sys
from collections import defaultdict
from decimal import Decimal,InvalidOperation
from zoneinfo import ZoneInfo

query = """BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='2.5s';
SET LOCAL lock_timeout='500ms';
SET LOCAL TIME ZONE 'UTC';
SELECT transaction_timestamp() AS transaction_clock;
COPY (
  SELECT stock_id,symbol,exchange,instrument_type,listing_status,provider,roster_version,
         source_timestamp,recorded_at,valid_from,valid_to
  FROM stock_instruments_v3
  WHERE source_timestamp <= recorded_at AND recorded_at <= transaction_timestamp()
) TO STDOUT WITH (FORMAT csv, HEADER);
ROLLBACK;
"""
def instant(value):
    return dt.datetime.fromisoformat(value)
def positive(value):
    try:
        x=Decimal(value.replace(",",""))
        return x if x.is_finite() and x>0 else None
    except InvalidOperation:
        return None
def prices(raw,key,field):
    result={}
    for row in csv.DictReader(io.StringIO(raw.decode("utf-8-sig"),newline=""),strict=True):
        symbol=row[key]
        assert symbol not in result
        price=positive(row[field])
        result[symbol]=price
    return result
windows=json.loads(sys.argv[1])
root=pathlib.Path(sys.argv[2])
raw_receipt=json.loads((root/"receipt.json").read_text())
spans={}
for p in raw_receipt["historicalSamples"]:
    day=p["requestedSession"]
    assert p["datasetId"]==11764 and p["bodyDates"]==[day.replace("-","")] and p["profile"]=="MATCHED_DATE"
    raw=(root/(day+".csv")).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==p["sha256"] and day not in spans
    spans[day]=prices(raw,"證券代號","收盤價")
assert set(spans)==set(windows["2026-11-12"])|set(windows["2026-11-13"])
a=subprocess.run(["/usr/sbin/runuser","-u","postgres","--","/usr/bin/psql","-X","-Atq","-v","ON_ERROR_STOP=1","-d","stockinsider"],
 input=query,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=8,check=True)
lines=a.stdout.splitlines()
db_clock=instant(lines[0]).isoformat()
identity=list(csv.DictReader(lines[1:]))
stats={}
for session,dates in windows.items():
    regular=set(dates[-20:])
    cutoff=dt.datetime.combine(dt.date.fromisoformat(session),dt.time(21,30),ZoneInfo("Asia/Taipei"))
    by_stock=defaultdict(list)
    for row in identity:
        if instant(row["recorded_at"])<=cutoff:
            by_stock[row["stock_id"]].append(row)
    candidates=[]
    for obs in by_stock.values():
        prior=max(instant(r["recorded_at"]) for r in obs)
        head=[row for row in obs if instant(row["recorded_at"])==prior]
        if len(head)!=1:continue
        r=head[0]
        if (r["exchange"],r["instrument_type"],r["listing_status"],r["provider"],r["roster_version"])!=(
         "TWSE","common_stock","active","twse","tw-instrument-roster-v3.0"):
            continue
        if instant(r["valid_from"])>cutoff or r["valid_to"] and cutoff>=instant(r["valid_to"]):
            continue
        k=r["symbol"]
        if k.isascii() and k.isdigit() and len(k)==4:candidates.append(k)
    counts=defaultdict(int)
    for k in candidates:counts[k]+=1
    selected={k for k,n in counts.items() if n==1}
    breakdown=defaultdict(int)
    for k in selected:
        present={day for day in dates if spans[day].get(k) is not None}
        if session not in present:profile="no_signal_date_close"
        elif len(present)<20:profile="signal_close_but_fewer_than_20"
        elif not regular<=present:profile="signal_close_and_20_of_30_only"
        else:profile="all_exact_20"
        breakdown[profile]+=1
    stats[session]={"knownTimedRosterDiagnostic":len(selected),"breakdown":dict(breakdown),
     "selectedSignalCloseAnd20Of30":breakdown["all_exact_20"]+breakdown["signal_close_and_20_of_30_only"],
     "selectedCutoffAvailabilityProved":False}
quote_file=pathlib.Path("/var/lib/private/stockinsider-stage-close-observer-202611/rehearsal/twse_quotes.csv")
quote_raw=quote_file.read_bytes()
assert hashlib.sha256(quote_raw).hexdigest()==sys.argv[3]
quote=prices(quote_raw,"證券代號","收盤價")
older=spans["2026-11-13"]
inter=quote.keys()&older.keys()
valid={k for k in inter if quote[k] is not None and older[k] is not None}
report={"readonlyDbStatementSha256":hashlib.sha256(query.encode()).hexdigest(),"observedDbAt":db_clock,
 "comparedMarkets":["TWSE"],"aggregateCoverage":stats,"actualDailySourcesCompared":{
  "quoteDataset":11549,"closeWithValuationDataset":11764,"sameSession":"2026-11-13","symbolsIntersect":len(inter),
  "bothPositive":len(valid),"bothPositiveClosesExactlyEqual":sum(quote[k]==older[k] for k in valid),
  "unequalCloses":sum(quote[k]!=older[k] for k in valid),"quotePositiveOnly":sum(quote[k] is not None and older[k] is None for k in inter),
  "valuationPositiveOnly":sum(quote[k] is None and older[k] is not None for k in inter),"quoteSha256":sys.argv[3]},
  "observedCutoffAppliedToInstrumentIdentityOnly":True,"companyActionAdjusted":False,"productionMutated":False,"rangOrWriterInvocation":False}
print(json.dumps(report))

import csv, datetime as dt, hashlib, io, json, os, subprocess, sys
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zoneinfo import ZoneInfo

windows=json.loads(sys.argv[1])
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
COPY (
  SELECT stock_id,session_date,as_of,available_at
  FROM official_price_history
  WHERE session_date BETWEEN DATE '2026-09-29' AND DATE '2026-11-13'
    AND close>0 AND close::text NOT IN ('NaN','Infinity','-Infinity')
) TO STDOUT WITH (FORMAT csv, HEADER);
COPY (
  SELECT stock_id,exchange,session_id,source_timestamp,collected_at,recorded_at
  FROM opportunity_price_observations_v3
  WHERE session_id BETWEEN DATE '2026-09-29' AND DATE '2026-11-13'
    AND raw_close>0 AND raw_close::text NOT IN ('NaN','Infinity','-Infinity')
) TO STDOUT WITH (FORMAT csv, HEADER);
ROLLBACK;
"""
proc=subprocess.run(
    ["/usr/sbin/runuser","-u","postgres","--","/usr/bin/psql","-X","-Atq","-v","ON_ERROR_STOP=1","-d","stockinsider"],
    input=query,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=10,
)
if proc.returncode:
    reason="QUERY_TIMEOUT" if "statement timeout" in proc.stderr else "OTHER_QUERY_FAILURE"
    print(json.dumps({"diagnostic":reason,"producerCalled":False}))
    sys.exit(2)
lines=proc.stdout.splitlines()
now=dt.datetime.fromisoformat(lines[0])
head=[i for i,line in enumerate(lines) if line.startswith("stock_id,")]
assert len(head)==3 and head[0]==1
identity_data,price_data,v3_data=[
    list(csv.DictReader(lines[a:b]))
    for a,b in zip(head,[*head[1:],len(lines)])
]
def stamp(value):
    return dt.datetime.fromisoformat(value)
def group_price(items, dated, clock_keys):
    result=defaultdict(list)
    for item in items:
        result[item["stock_id"]].append((
            item[dated],item.get("exchange"),
            tuple(stamp(item[k]) for k in clock_keys),
        ))
    return result
prices=group_price(price_data,"session_date",("as_of","available_at"))
v3=group_price(v3_data,"session_id",("source_timestamp","collected_at","recorded_at"))

def points(stream, identifier, venue, limit, allow_date, native=False):
    days=set()
    for date, exchange, times in stream.get(identifier,()):
        if date not in allow_date or (native and exchange!=venue):
            continue
        if all(value <= limit for value in times) and (not native or times[0]<=times[1]<=times[2]):
            days.add(date)
    return days

def public_close_sets(roots, expected_days):
    result={}
    for root_name in roots:
        root=Path(root_name)
        receipt=json.loads((root/"receipt.json").read_text())
        for item in receipt["historicalSamples"]:
            iso_date=item["sourceDate"]
            assert iso_date in expected_days and iso_date not in result
            assert item["datasetId"]==11371 and not item["timelySessionPayload"]
            raw=(root/(iso_date+".csv")).read_bytes()
            assert hashlib.sha256(raw).hexdigest()==item["sha256"]
            good=set()
            for bar in csv.DictReader(raw.decode("utf-8-sig").splitlines(),strict=True):
                try:
                    price=Decimal(bar["收盤"].replace(",",""))
                except InvalidOperation:
                    continue
                if price.is_finite() and price>0:
                    good.add(bar["代號"])
            result[iso_date]=good
    assert set(result)==set(expected_days)
    return result

backfill_day="2026-11-13"
backfill=public_close_sets(json.loads(sys.argv[2]),windows[backfill_day])
rows=[]
for target,window in windows.items():
    allowed=set(window)
    last20=set(window[-20:])
    cutoff=dt.datetime.combine(dt.date.fromisoformat(target),dt.time(21,30),ZoneInfo("Asia/Taipei"))
    for scope,limit in (("original",cutoff),("current",now)):
        by_stock=defaultdict(list)
        for r in identity_data:
            if stamp(r["recorded_at"])<=limit:
                by_stock[r["stock_id"]].append(r)
        top=defaultdict(list)
        for stock, records in by_stock.items():
            latest=max(stamp(r["recorded_at"]) for r in records)
            heads=[r for r in records if stamp(r["recorded_at"])==latest]
            top[heads[0]["exchange"]].append(heads)
        for exchange in ("TWSE","TPEX"):
            candidates=[]
            for heads in top[exchange]:
                if len(heads)!=1:
                    continue
                r=heads[0]
                if (r["instrument_type"],r["listing_status"],r["provider"],r["roster_version"])!=(
                    "common_stock","active",exchange.lower(),"tw-instrument-roster-v3.0",
                ):
                    continue
                if stamp(r["valid_from"])>cutoff or r["valid_to"] and stamp(r["valid_to"])<=cutoff:
                    continue
                candidates.append(r)
            symbols=defaultdict(int)
            for r in candidates:
                symbols[r["symbol"]]+=1
            roster=[r for r in candidates if symbols[r["symbol"]]==1 and r["symbol"].isascii() and r["symbol"].isdigit() and len(r["symbol"])==4]
            row={"target":target,"scope":scope,"venue":exchange,"latestIdentityCount":len(top[exchange]),"selectedCommonIdentityCount":len(roster)}
            for key,stream,native in (("currentLegacyCache",prices,False),("v3ObservedRows",v3,True)):
                spans=[points(stream,r["stock_id"],exchange,limit,allowed,native) for r in roster]
                row[key]={
                    "hasTargetClose":sum(target in ds for ds in spans),
                    "has20Of30IgnoringTargetDay":sum(len(ds)>=20 for ds in spans),
                    "hasTargetAnd20Of30":sum(target in ds and len(ds)>=20 for ds in spans),
                    "hasAllLast20OfficialDates":sum(last20<=ds for ds in spans),
                }
            if target==backfill_day and scope=="original" and exchange=="TPEX":
                distribution=defaultdict(int)
                for r in roster:
                    symbol=r["symbol"]
                    observed={session for session in window if symbol in backfill[session]}
                    if target not in observed:
                        key="no_close_on_signal_date"
                    elif len(observed)<20:
                        key="signal_close_but_fewer_than_20"
                    elif not last20<=observed:
                        key="signal_close_and_20_of_30_only"
                    else:
                        key="all_exact_20"
                    distribution[key]+=1
                row["lateObservedOfficialTpexBackfill"]={"breakdown":dict(distribution),"rawHashesRechecked":len(backfill),"originalCutoffAvailabilityClaim":False}
            rows.append(row)
print(json.dumps({"observedAt":now.isoformat(),"scope":"POSITIVE_CLOSE_ROWS_BY_KNOWLEDGE_CLOCK; aggregate diagnostic only", 
    "sqlSha256":hashlib.sha256(query.encode()).hexdigest(),"spans":rows,"catalogRowsRead":{
      "identityObservations":len(identity_data),"legacyPriceRows":len(price_data),"v3PriceObservations":len(v3_data)}}))

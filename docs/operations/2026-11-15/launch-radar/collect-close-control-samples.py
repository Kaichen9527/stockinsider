#!/usr/bin/env python3
"""Unwired, nonroot post-capture samples. Original five-source collector untouched."""
import argparse
import csv
from datetime import date,datetime,time,timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import resource
import ssl
import stat
import subprocess
import sys
import time as clock
from urllib.error import HTTPError,URLError
from urllib.request import HTTPSHandler,HTTPRedirectHandler,Request,build_opener
from zoneinfo import ZoneInfo

TAIPEI=ZoneInfo('Asia/Taipei')
SESSIONS=('2026-11-16','2026-11-17')
MAX_BYTES=2_000_000
MAX_ROWS=10_000
WIRE_BYTES=8192
SOCKET_SECONDS=8
WORKER_SECONDS=20
REAP_SECONDS=2
BASE_IDS={'twse_quotes':11549,'tpex_quotes':11371,'twse_issuers':18419,'tpex_issuers':25036,'tpex_market_foreign_flow':11743}
HEADERS={29082:('編號','公布日期','證券代號','證券名稱','累計','處置條件','處置起迄時間','處置措施','處置內容','備註'),11396:('公布日期','證券代號','證券名稱','處置起訖時間','處置原因','處置內容'),48664:('資料日期','證券代號','證券名稱','暫停交易','恢復交易')}
STATES=frozenset(('DATED_SELECTOR_ROWS_OBSERVED','DATED_SELECTOR_EMPTY_UNKNOWN','CURRENT_LIST_UNBOUND_SESSION','EMPTY_CURRENT_LIST_UNBOUND_SESSION','NAMED_DATE_ROWS_OBSERVED','EMPTY_NAMED_DATE_OBSERVED','EMPTY_UNDATED_UNKNOWN','MIXED_RESPONSE_DATES','HTTP_ERROR','NETWORK_OR_TIMEOUT','CONTENT_TYPE_REJECTED','BYTE_LIMIT','ENCODING_REJECTED','SCHEMA_REJECTED','ROW_LIMIT','DATE_REJECTED','IDENTITY_REJECTED','OUTSIDE_WINDOW','RUNTIME_BOUNDARY_UNVERIFIED','WORKER_DEADLINE','WORKER_REJECTED','CLEANUP_UNCONFIRMED'))


class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*_,**__):return None


class FixedParser(argparse.ArgumentParser):
 def error(self,_):
  print(json.dumps({'schema':'stockinsider-close-control-samples-v1','status':'NOT_CAPTURED','positiveEligibilityAuthority':False,'clearsOtherSessionSuspensions':False}))
  raise SystemExit(2)


class SampleRejected(Exception):
 def __init__(self,status='SCHEMA_REJECTED'):
  self.status=status if status in STATES else 'SCHEMA_REJECTED'
  super().__init__('fixed_control_sample_rejected')


def now():return datetime.now(timezone.utc)
def cutoff(session):return datetime.combine(date.fromisoformat(session),time(21,30),tzinfo=TAIPEI)
def within(session,observed):
 local=observed.astimezone(TAIPEI)
 return session in SESSIONS and local.date().isoformat()==session and time(13,30)<=local.time()<=time(21,30)


def closed_json(raw):
 def pairs(items):
  result={}
  for key,value in items:
   if key in result:raise SampleRejected()
   result[key]=value
  return result
 return json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(SampleRejected()))


def source_urls(session):
 if session not in SESSIONS:raise SampleRejected()
 compact=session.replace('-','')
 return {29082:'https://www.twse.com.tw/announcement/punish?response=open_data&startDate='+compact+'&endDate='+compact,
  11396:'https://www.tpex.org.tw/web/bulletin/disposal_information/disposal_information_result.php?l=zh-tw&o=data',
  48664:'https://www.tpex.org.tw/web/stock/aftertrading/spendi/sprc_today_result.php?l=zh-tw&o=data'}


def source_day(value):
 if re.fullmatch(r'[0-9]{7}',value):value=str(1911+int(value[:3]))+value[3:]
 if not re.fullmatch(r'[0-9]{8}',value):raise SampleRejected('DATE_REJECTED')
 try:return date(int(value[:4]),int(value[4:6]),int(value[6:])).isoformat()
 except ValueError:raise SampleRejected('DATE_REJECTED') from None


def parse_sample(dataset,raw):
 try:reader=csv.reader(io.StringIO(raw.decode('utf-8-sig'),newline=''),strict=True)
 except UnicodeError:raise SampleRejected('ENCODING_REJECTED') from None
 try:
  if tuple(next(reader,()))!=HEADERS[dataset]:raise SampleRejected()
  dates=set();identities=set();records=sentinels=0
  for index,row in enumerate(reader):
   if index>=MAX_ROWS:raise SampleRejected('ROW_LIMIT')
   if len(row)!=len(HEADERS[dataset]) or any(len(v.encode())>65536 for v in row):raise SampleRejected()
   row=[v.strip() for v in row]
   if not any(row):continue
   day_index=1 if dataset==29082 else 0;key_index=2 if dataset==29082 else 1
   day=source_day(row[day_index]);key=row[key_index]
   if not key:
    if dataset!=48664 or any(v for i,v in enumerate(row) if i!=day_index):raise SampleRejected('IDENTITY_REJECTED')
    sentinels+=1;dates.add(day);continue
   # Keep the whole identity private; never truncate a bond ID to a stock ID.
   if not re.fullmatch(r'[0-9A-Za-z]{1,16}',key):raise SampleRejected('IDENTITY_REJECTED')
   records+=1;identities.add(key);dates.add(day)
  if sentinels and (records or sentinels!=1):raise SampleRejected()
 except (csv.Error,KeyError):raise SampleRejected() from None
 result={'rowCount':records,'identityCount':len(identities),'sourceDateMin':min(dates) if dates else None,'sourceDateMax':max(dates) if dates else None,'responseDate':None}
 if dataset==48664:
  if len(dates)==1:result['responseDate']=next(iter(dates))
  status=('MIXED_RESPONSE_DATES' if len(dates)>1 else 'EMPTY_NAMED_DATE_OBSERVED' if sentinels else 'NAMED_DATE_ROWS_OBSERVED' if records else 'EMPTY_UNDATED_UNKNOWN')
 elif dataset==29082:status='DATED_SELECTOR_ROWS_OBSERVED' if records else 'DATED_SELECTOR_EMPTY_UNKNOWN'
 else:status='CURRENT_LIST_UNBOUND_SESSION' if records else 'EMPTY_CURRENT_LIST_UNBOUND_SESSION'
 return {**result,'status':status}


def empty_sample(dataset,status):
 return {'datasetId':dataset,'requestedAt':None,'observedAt':None,'httpStatus':None,'bytes':None,'sha256':None,'rowCount':None,'identityCount':None,'sourceDateMin':None,'sourceDateMax':None,'responseDate':None,'responseDateMatchesSession':False,'observedBeforeCutoff':False,'sameTaipeiDate':False,'status':status,'positiveEligibilityAuthority':False,'clearsOtherSessionSuspensions':False}


def collect_sample(dataset,url,session):
 r=empty_sample(dataset,'NETWORK_OR_TIMEOUT');r['requestedAt']=now().isoformat()
 if not within(session,now()):r['status']='OUTSIDE_WINDOW';return r
 try:
  opener=build_opener(HTTPSHandler(context=ssl.create_default_context()),NoRedirect())
  req=Request(url,headers={'User-Agent':'StockInsider/1.0 public dataset verification','Accept':'text/csv, application/csv'})
  with opener.open(req,timeout=SOCKET_SECONDS) as response:
   r['httpStatus']=response.status
   if response.headers.get_content_type() not in ('text/csv','application/csv'):raise SampleRejected('CONTENT_TYPE_REJECTED')
   raw=response.read(MAX_BYTES+1)
  observed=now();r['observedAt']=observed.isoformat()
  if len(raw)>MAX_BYTES:raise SampleRejected('BYTE_LIMIT')
  r.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest());r.update(parse_sample(dataset,raw))
  r['observedBeforeCutoff']=observed<=cutoff(session);r['sameTaipeiDate']=observed.astimezone(TAIPEI).date().isoformat()==session
  r['responseDateMatchesSession']=r['responseDate']==session
  if not within(session,observed):r['status']='OUTSIDE_WINDOW'
 except HTTPError as e:r.update(httpStatus=e.code,status='HTTP_ERROR')
 except SampleRejected as e:r['status']=e.status
 except (URLError,OSError,TimeoutError):r['status']='NETWORK_OR_TIMEOUT'
 return r


def worker(session):
 return {str(dataset):collect_sample(dataset,url,session) for dataset,url in source_urls(session).items()}


def project_samples(value):
 expected={'29082','11396','48664'}
 if type(value) is not dict or set(value)!=expected:return None
 projected={}
 for key,row in value.items():
  prototype=empty_sample(int(key),'WORKER_REJECTED')
  if type(row) is not dict or set(row)!=set(prototype) or row['datasetId']!=int(key) or type(row['datasetId']) is not int:return None
  if type(row['status']) is not str or row['status'] not in STATES:return None
  for field in ('responseDateMatchesSession','observedBeforeCutoff','sameTaipeiDate','positiveEligibilityAuthority','clearsOtherSessionSuspensions'):
   if type(row[field]) is not bool:return None
  if row['positiveEligibilityAuthority'] or row['clearsOtherSessionSuspensions']:return None
  for field in ('bytes','rowCount','identityCount','httpStatus'):
   bound=MAX_BYTES if field=='bytes' else 599 if field=='httpStatus' else MAX_ROWS
   if row[field] is not None and (type(row[field]) is not int or not 0<=row[field]<=bound):return None
  if row['sha256'] is not None and (type(row['sha256']) is not str or not re.fullmatch('[0-9a-f]{64}',row['sha256'])):return None
  for field in ('sourceDateMin','sourceDateMax','responseDate'):
   if row[field] is not None:
    try:
     if type(row[field]) is not str or date.fromisoformat(row[field]).isoformat()!=row[field]:return None
    except ValueError:return None
  for field in ('requestedAt','observedAt'):
   if row[field] is not None:
    try:
     if type(row[field]) is not str or len(row[field])>40 or datetime.fromisoformat(row[field]).utcoffset() is None:return None
    except ValueError:return None
  projected[key]={k:row[k] for k in prototype}
 return projected


def child_limits():
 resource.setrlimit(resource.RLIMIT_CORE,(0,0));resource.setrlimit(resource.RLIMIT_CPU,(10,10))
 resource.setrlimit(resource.RLIMIT_AS,(64*1024**2,64*1024**2));resource.setrlimit(resource.RLIMIT_NOFILE,(32,32));resource.setrlimit(resource.RLIMIT_FSIZE,(0,0))


def runtime_budget(worker_process=False):
 """Read own kernel/cgroup/manager limits, never caller readiness assertions."""
 try:
  if not any(line.split(' - ',1)[1].startswith('cgroup2 ') and line.split(' - ',1)[0].split()[4]=='/sys/fs/cgroup' for line in Path('/proc/self/mountinfo').read_text().splitlines()):return None
  cg=Path('/proc/self/cgroup').read_text().strip()
  if not re.fullmatch(r'0::/system\.slice/[A-Za-z0-9_.@:-]+\.service',cg):return None
  relative=cg.removeprefix('0::');root=Path('/sys/fs/cgroup')/relative.lstrip('/')
  if int((root/'memory.max').read_text())!=134217728 or int((root/'pids.max').read_text())!=12:return None
  reserve=16 if worker_process else 80;task_floor=10 if worker_process else 8
  if int((root/'memory.current').read_text())>134217728-reserve*1024**2 or int((root/'pids.current').read_text())>task_floor:return None
  started=int(Path('/proc/self/stat').read_text().rsplit(')',1)[1].split()[19])/os.sysconf('SC_CLK_TCK')
  if not worker_process and not 0<=clock.monotonic()-started<=50:return None
  unit=relative.rsplit('/',1)[1]
  keys=('Type','RuntimeMaxUSec','TimeoutStartUSec','MemoryMax','TasksMax','DynamicUser','KillMode','MainPID','ControlGroup','ExecMainStartTimestampMonotonic')
  p=subprocess.run(['/usr/bin/systemctl','show',unit,'--no-pager',*('--property='+k for k in keys)],capture_output=True,text=True,timeout=2,env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},close_fds=True)
  if p.returncode or len(p.stdout)>4096:return None
  values={}
  for line in p.stdout.splitlines():
   k,sep,v=line.partition('=')
   if not sep or k not in keys or k in values:return None
   values[k]=v
  if set(values)!=set(keys):return None
  expected={'Type':'exec','MemoryMax':'134217728','TasksMax':'12','DynamicUser':'yes','KillMode':'control-group','ControlGroup':relative,'MainPID':str(os.getppid() if worker_process else os.getpid())}
  if any(values[k]!=v for k,v in expected.items()):return None
  if any(values[k] not in ('1min 30s','90s','90000000') for k in ('RuntimeMaxUSec','TimeoutStartUSec')):return None
  activated=int(values['ExecMainStartTimestampMonotonic'])/1000000
  if not 0<activated<=clock.monotonic():return None
  if not worker_process and abs(activated-started)>2:return None
  remaining=min(activated+90-clock.monotonic(),(cutoff(now().astimezone(TAIPEI).date().isoformat())-now()).total_seconds())
  if remaining<(8 if worker_process else 30):return None
  if int((root/'memory.current').read_text())>134217728-reserve*1024**2 or int((root/'pids.current').read_text())>task_floor:return None
  return remaining
 except (OSError,ValueError,KeyError,IndexError,subprocess.SubprocessError):return None


def bounded_worker(session):
 fallback=lambda status:{str(k):empty_sample(k,status) for k in HEADERS}
 observed=now()
 if not within(session,observed) or (cutoff(session)-observed).total_seconds()<WORKER_SECONDS+REAP_SECONDS+2:return fallback('OUTSIDE_WINDOW')
 remaining=runtime_budget()
 if remaining is None:return fallback('RUNTIME_BOUNDARY_UNVERIFIED')
 p=subprocess.Popen([sys.executable,'-I','-B',str(Path(__file__).resolve()),session,'--_worker'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},close_fds=True,preexec_fn=child_limits)
 try:
  try:raw,_=p.communicate(input=b'fixed-close-samples-v1\n',timeout=min(WORKER_SECONDS,remaining-8))
  except subprocess.TimeoutExpired:
   p.kill()
   try:p.communicate(timeout=REAP_SECONDS)
   except subprocess.TimeoutExpired:return fallback('CLEANUP_UNCONFIRMED')
   return fallback('WORKER_DEADLINE')
  if p.returncode or len(raw)>WIRE_BYTES:return fallback('WORKER_REJECTED')
  try:result=project_samples(closed_json(raw))
  except (ValueError,UnicodeError,SampleRejected):result=None
  return result if result is not None else fallback('WORKER_REJECTED')
 finally:
  if p.poll() is None:p.kill()
  if p.stdout:p.stdout.close()


def private_directory(path):
 p=Path(path)
 if not p.is_absolute() or '..' in p.parts:raise SampleRejected()
 fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
 try:
  for part in p.parts[1:]:
   child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=fd);os.close(fd);fd=child
  s=os.fstat(fd)
  if s.st_uid!=os.getuid() or stat.S_IMODE(s.st_mode)!=0o700:raise SampleRejected()
  return fd
 except BaseException:os.close(fd);raise


def base_finished(directory,session):
 fd=os.open('receipt.json',os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=directory)
 try:
  s=os.fstat(fd)
  if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or stat.S_IMODE(s.st_mode)!=0o600 or s.st_size>65536:raise SampleRejected()
  raw=os.read(fd,65537);after=os.fstat(fd);base=closed_json(raw)
  if (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise SampleRejected()
  if (type(base) is not dict or base.get('schema')!='stockinsider-close-public-input-observation-v1' or base.get('session')!=session or base.get('cutoff')!=cutoff(session).isoformat() or base.get('publishOrWriterInvoked') is not False or type(base.get('sources')) is not dict or set(base['sources'])!=set(BASE_IDS)):raise SampleRejected()
  finished=datetime.fromisoformat(base['captureFinishedAt']);started=datetime.fromisoformat(base['captureStartedAt'])
  if finished.utcoffset() is None or started.utcoffset() is None or not started<=finished<=now() or not within(session,finished):raise SampleRejected()
  for key,dataset in BASE_IDS.items():
   row=base['sources'][key]
   if type(row) is not dict or type(row.get('datasetId')) is not int or row['datasetId']!=dataset:raise SampleRejected()
   requested=datetime.fromisoformat(row['requestedAt'])
   if requested.utcoffset() is None or not started<=requested<=finished:raise SampleRejected()
   if 'error' not in row:
    observed=datetime.fromisoformat(row['observedAt'])
    if observed.utcoffset() is None or not requested<=observed<=finished:raise SampleRejected()
  return hashlib.sha256(raw).hexdigest()
 finally:os.close(fd)


def capture(session,path):
 if os.geteuid()==0:raise SampleRejected()
 directory=private_directory(path)
 try:
  digest=base_finished(directory,session)
  # Reserve before any request: a duplicate invocation cannot refetch sources.
  # On interruption leave the incomplete private receipt for explicit review.
  fd=os.open('controls-receipt.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o600,dir_fd=directory)
  try:
   results=bounded_worker(session)
   if base_finished(directory,session)!=digest:raise SampleRejected()
   receipt={'schema':'stockinsider-close-control-samples-v1','session':session,'cutoff':cutoff(session).isoformat(),'scope':'source-observation-only','baseReceiptSha256':digest,'originalFiveReceiptChanged':False,'positiveEligibilityAuthority':False,'clearsOtherSessionSuspensions':False,'sources':results}
   data=(json.dumps(receipt,separators=(',',':'))+'\n').encode()
   with os.fdopen(fd,'wb',closefd=False) as output:output.write(data);output.flush();os.fsync(output.fileno())
  finally:os.close(fd)
  return receipt
 finally:os.close(directory)


def main():
 parser=FixedParser();parser.add_argument('session',choices=SESSIONS);parser.add_argument('--base-directory',type=Path);parser.add_argument('--_worker',action='store_true',help=argparse.SUPPRESS);args=parser.parse_args()
 try:
  if os.geteuid()==0:raise SampleRejected()
  if args._worker:
   if not stat.S_ISFIFO(os.fstat(0).st_mode) or sys.stdin.buffer.read(64)!=b'fixed-close-samples-v1\n' or runtime_budget(True) is None:raise SampleRejected()
   value=worker(args.session);raw=json.dumps(value,separators=(',',':')).encode()
   if len(raw)>WIRE_BYTES:raise SampleRejected()
   sys.stdout.buffer.write(raw);return 0
  if args.base_directory is None:raise SampleRejected()
  receipt=capture(args.session,args.base_directory);print(json.dumps(receipt));return 0
 except Exception:
  print(json.dumps({'schema':'stockinsider-close-control-samples-v1','status':'NOT_CAPTURED','positiveEligibilityAuthority':False,'clearsOtherSessionSuspensions':False}));return 2


if __name__=='__main__':raise SystemExit(main())

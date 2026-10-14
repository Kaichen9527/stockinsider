import os,sys,subprocess,pathlib,time,json,datetime,signal,resource
label=sys.argv[1];cmd=sys.argv[2:];base=pathlib.Path('/tmp/cash-owner-o14/raw');env=os.environ.copy();env['PATH']='/workspace/.tools/node22/node_modules/.bin:'+env['PATH']
def free(p):s=os.statvfs(p);return s.f_bavail*s.f_frsize
initial={p:free(p)for p in ['/workspace','/tmp']}
if min(initial.values())<8589934592:raise SystemExit('disk_admission_failed')
start=datetime.datetime.now(datetime.timezone.utc).isoformat();peak=0;minfree=initial.copy();samples=0
with (base/(label+'.stdout')).open('wb')as out,(base/(label+'.stderr')).open('wb')as err:
 p=subprocess.Popen(cmd,cwd='/tmp/si-pubtail-o14',env=env,stdout=out,stderr=err,start_new_session=True)
 while p.poll()is None:
  total=0
  for entry in pathlib.Path('/proc').iterdir():
   if not entry.name.isdigit():continue
   try:
    stat=(entry/'stat').read_text();fields=stat[stat.rfind(')')+2:].split()
    if int(fields[2])==p.pid:total+=int(fields[21])*os.sysconf('SC_PAGE_SIZE')
   except (OSError,ValueError,IndexError):pass
  peak=max(peak,total);samples+=1
  for k in minfree:minfree[k]=min(minfree[k],free(k))
  if total>8589934592 or min(minfree.values())<8589934592:
   os.killpg(p.pid,signal.SIGTERM)
  time.sleep(.1)
 code=p.wait()
end=datetime.datetime.now(datetime.timezone.utc).isoformat();record={'command':cmd,'cwd':'/tmp/si-pubtail-o14','start':start,'end':end,'exitCode':code,'processGroupPeakRssBytes':peak,'rssSampling':'sum /proc PGID RSS every100ms; may miss transient peaks; resource child maxRSS included separately','samples':samples,'childMaxRssKiB':resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,'initialFreeBytes':initial,'minFreeBytes':minfree}
(base/(label+'.resource.json')).write_text(json.dumps(record,indent=2)+'\n');(base/(label+'.exit')).write_text(str(code)+'\n');print(json.dumps(record));sys.exit(code)

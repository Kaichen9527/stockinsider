import subprocess,pathlib,time,os,signal,json,shutil,hashlib,datetime
out=pathlib.Path('/tmp/v3-citations-o15');node='/workspace/.tools/node22/node_modules/node/bin/node'
subject=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
commands=[('sealed-tests',[node,'--experimental-strip-types','--test','--test-concurrency=1','scripts/research-v3-article-citations.test.mjs']),('sealed-types',[node,'web/node_modules/typescript/bin/tsc','--noEmit','--strict','--skipLibCheck','--target','ES2022','--module','ESNext','--moduleResolution','Bundler','--allowImportingTsExtensions','--resolveJsonModule','--esModuleInterop','--types','node','--typeRoots','web/node_modules/@types','web/src/lib/research-v3-article-citations.ts']),('sealed-syntax',[node,'--check','scripts/research-v3-article-citations.test.mjs'])]
records=[]
for label,cmd in commands:
 free={x:shutil.disk_usage(x).free for x in ['/workspace','/tmp']};assert min(free.values())>=8589934592
 with (out/(label+'.stdout')).open('w') as stdout,(out/(label+'.stderr')).open('w') as stderr:
  start=time.monotonic();p=subprocess.Popen(cmd,stdout=stdout,stderr=stderr,start_new_session=True);peak=0;floor=dict(free);limit=None
  while p.poll() is None:
   rows={}
   for f in pathlib.Path('/proc').glob('[0-9]*/stat'):
    try:
     a=f.read_text().rsplit(')',1)[1].split();rows[int(f.parent.name)]=(int(a[1]),int(a[21])*os.sysconf('SC_PAGE_SIZE'))
    except (FileNotFoundError,ProcessLookupError,PermissionError):pass
   ids={p.pid}
   while True:
    more={pid for pid,(parent,rss) in rows.items() if parent in ids}-ids
    if not more:break
    ids.update(more)
   rss=sum(rows.get(pid,(0,0))[1]for pid in ids);peak=max(peak,rss)
   for x in floor:floor[x]=min(floor[x],shutil.disk_usage(x).free)
   if rss>8589934592 or min(floor.values())<8589934592:
    limit='resource_guard';os.killpg(p.pid,signal.SIGTERM);p.wait(timeout=10);break
   time.sleep(.02)
  code=p.wait()
 record={'label':label,'source':subject,'command':cmd,'exit':code,'durationSeconds':time.monotonic()-start,'peakSampledProcessTreeRssBytes':peak,'minimumFreeBytes':floor,'limit':limit}
 records.append(record);(out/'sealed-commands.json').write_text(json.dumps(records,indent=2)+'\n');print(json.dumps(record),flush=True)
 if code:raise SystemExit(code)

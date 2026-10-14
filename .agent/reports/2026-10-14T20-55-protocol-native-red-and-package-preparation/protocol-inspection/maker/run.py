import os,sys,time,subprocess,json,pathlib,datetime,pwd,signal
out=pathlib.Path('/tmp/versioned-protocol-implementation-o14'); label=sys.argv[1];cmd=sys.argv[2:];env=os.environ.copy();env['USER']=pwd.getpwuid(os.geteuid()).pw_name;env['PATH']='/workspace/.tools/node22/node_modules/node/bin:/workspace/cloud-acceptance-0faebfd/tools/root/usr/lib/postgresql/17/bin:'+env['PATH'];env['RESEARCH_PROTOCOL_ARTIFACTS']='/tmp/versioned-protocol-implementation-o14/'+label+'-artifacts';env['LD_LIBRARY_PATH']='/workspace/cloud-acceptance-0faebfd/tools/root/usr/lib/x86_64-linux-gnu'+(':'+env['LD_LIBRARY_PATH'] if env.get('LD_LIBRARY_PATH')else'')
start=time.time(); result={'command':cmd,'start':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cwd':os.getcwd(),'sampleSeconds':.25,'peakProcessTreeRss':0,'minFree':{},'user':env['USER']}
for path in ['/workspace','/tmp']:
 f=os.statvfs(path);free=f.f_bavail*f.f_frsize;result['minFree'][path]=free
 if free<8589934592:raise SystemExit('capacity not admitted')
with (out/(label+'.stdout')).open('wb')as so,(out/(label+'.stderr')).open('wb')as se:
 p=subprocess.Popen(cmd,stdout=so,stderr=se,env=env,start_new_session=True)
 while p.poll()is None:
  rss=0
  for d in pathlib.Path('/proc').iterdir():
   if d.name.isdigit():
    try:
     st=(d/'stat').read_text().split();sid=int(st[5]);
     if sid==p.pid:rss+=int((d/'statm').read_text().split()[1])*4096
    except (OSError,ValueError,IndexError):pass
  result['peakProcessTreeRss']=max(result['peakProcessTreeRss'],rss)
  for path in result['minFree']:
   f=os.statvfs(path);result['minFree'][path]=min(result['minFree'][path],f.f_bavail*f.f_frsize)
  if rss>8589934592 or min(result['minFree'].values())<8589934592 or time.time()>1791981170.0:
   result['boundStop']=True;os.killpg(p.pid,signal.SIGTERM)
  time.sleep(.25)
 result['exit']=p.wait()
result['seconds']=time.time()-start;(out/(label+'.result.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));sys.exit(result['exit'])

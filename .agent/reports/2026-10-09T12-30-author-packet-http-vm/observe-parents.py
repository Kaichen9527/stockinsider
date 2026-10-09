import json,pathlib,subprocess,time,datetime
root=pathlib.Path('/workspace/cloud-author-packet-artifacts-oct09')
work=pathlib.Path('/workspace/cloud-author-packet-http-vm-oct09')
paths=[pathlib.Path('/'),pathlib.Path('/workspace'),work,work/'docs',work/'docs/research']+sorted(p for p in (work/'docs/research').iterdir() if p.is_dir())
def stat(p):
 s=p.stat();return {'dev':s.st_dev,'ino':s.st_ino,'size':s.st_size,'mtimeNs':s.st_mtime_ns,'ctimeNs':s.st_ctime_ns}
last={str(p):stat(p) for p in paths};events=[{'clock':datetime.datetime.now(datetime.timezone.utc).isoformat(),'initial':last.copy()}]
p=subprocess.Popen(['python3',str(root/'run-check.py'),'native-author-packet-r2','/workspace/.tools/node22/node_modules/.bin/node','--experimental-strip-types','--test','--test-concurrency=1','--test-reporter=tap','scripts/research-author-packet-http.test.mjs'])
while p.poll() is None:
 for path in paths:
  current=stat(path);name=str(path)
  if current!=last[name]:events.append({'clock':datetime.datetime.now(datetime.timezone.utc).isoformat(),'path':name,'before':last[name],'after':current});last[name]=current
 time.sleep(.01)
(root/'native-r2-parent-observations.json').write_text(json.dumps({'readOnlySamplerMs':10,'mayMissShortTransitions':True,'events':events},indent=2)+'\n')
raise SystemExit(p.wait())

import pathlib,subprocess,datetime
root=pathlib.Path('/workspace/cloud-author-packet-artifacts-oct09/rr-stdin')
pg=pathlib.Path('/tmp/si-rresult-H4RTT0/pg');b=pathlib.Path('/workspace/cloud-acceptance-0faebfd/tools/root/usr/lib/postgresql/17/bin');sock=str(pg.parent)
assert datetime.datetime.now(datetime.timezone.utc).hour >= 16
queries=(root/'closed-window-read-sql.txt').read_text()
def run(a):
 r=subprocess.run(a,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout
started=False
try:
 run([str(b/'pg_ctl'),'-D',str(pg),'-l',str(root/'open-window-read-pg.log'),'-o',f"-h '' -k {sock} -p 59883",'-w','start']);started=True
 r=subprocess.run([str(b/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-h',sock,'-p','59883','-d','postgres'],input=queries,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
 (root/'open-window-read.log').write_text(r.stdout+r.stderr)
 print(r.stdout);assert r.returncode==0
finally:
 if started:run([str(b/'pg_ctl'),'-D',str(pg),'-m','immediate','-w','stop'])

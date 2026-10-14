import datetime,hashlib,json,os,pathlib,stat,subprocess
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'productionMutated':False,'dirs':{},'files':{},'units':{}}
for name in ['/etc','/etc/systemd','/etc/systemd/system','/etc/systemd/system/stockinsider-web-standalone.service.d','/etc/stockinsider']:
 try:
  s=os.lstat(name);result['dirs'][name]={'uid':s.st_uid,'gid':s.st_gid,'mode':oct(stat.S_IMODE(s.st_mode)),'directory':stat.S_ISDIR(s.st_mode),'symlink':stat.S_ISLNK(s.st_mode)}
 except OSError as e:result['dirs'][name]={'error':type(e).__name__}
for name in ['/etc/stockinsider/writer-release.env','/etc/systemd/system/stockinsider-web-standalone.service.d/20-writer-release.conf','/etc/systemd/system/stockinsider-web-standalone.service','/etc/systemd/system/stockinsider-internal-worker.service']:
 row={};result['files'][name]=row
 try:
  s=os.lstat(name);row.update(uid=s.st_uid,gid=s.st_gid,mode=oct(stat.S_IMODE(s.st_mode)),bytes=s.st_size,links=s.st_nlink,regular=stat.S_ISREG(s.st_mode),symlink=stat.S_ISLNK(s.st_mode))
  if not row['regular'] or s.st_size>32768:row['read']='rejected_type_or_size';continue
  fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
  try:
   t=os.fstat(fd);assert (t.st_dev,t.st_ino,t.st_size)==(s.st_dev,s.st_ino,s.st_size)
   parts=[];left=32769
   while left:
    b=os.read(fd,min(left,8192))
    if not b:break
    parts.append(b);left-=len(b)
   body=b''.join(parts);assert len(body)==s.st_size
   row['sha256']=hashlib.sha256(body).hexdigest();row['contentPrinted']=False
  finally:os.close(fd)
 except (OSError,AssertionError) as e:row['error']=type(e).__name__
keys=['Id','LoadState','FragmentPath','DropInPaths','NeedDaemonReload','User','Group','WorkingDirectory']
for name in ['stockinsider-web-standalone.service','stockinsider-internal-worker.service']:
 r=subprocess.run(['/usr/bin/systemctl','show',name,'--no-pager']+['--property='+k for k in keys],capture_output=True,text=True,timeout=10)
 result['units'][name]={'exit':r.returncode,'properties':dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)}
result['current']=os.path.realpath('/opt/stockinsider/current')
mem={line.split(':',1)[0]:line.split(':',1)[1].strip() for line in pathlib.Path('/proc/meminfo').read_text().splitlines()}
result['availableMemoryBytes']=int(mem['MemAvailable'].split()[0])*1024
result['requiredMemoryBytes']=2684354560
print(json.dumps(result,sort_keys=True))

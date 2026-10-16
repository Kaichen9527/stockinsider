#!/usr/bin/env bash
set -euo pipefail
exec 8>/run/lock/vps-heavy-operation.lock
exec 9>/run/lock/stockinsider-production-write.lock
exec 7>/run/lock/stockinsider-production-health.lock
flock -n 8 || exit 75
flock -n 9 || exit 75
flock -n 7 || exit 75
test "$(readlink -f /opt/stockinsider/current)" = /opt/stockinsider-standalone/releases/dd59817f750684b093965f539dd4de466be13077
/usr/bin/python3 -I - <<'PY'
import hashlib,json,os,pathlib,stat,sys
root=pathlib.Path('/tmp/stockinsider-official-2327-oct16-5z7lycns');s=root.lstat()
assert stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and stat.S_IMODE(s.st_mode)==0o700 and s.st_uid==0
items=[];contents=[]
for name,size,h in [('listing.html',35922,'700608592c5b2620191533d82e24116d05c6e9a4cc95bd5abab1883a71f6a3d6'),('2327.xhtml',1528880,'8900870e593b1342d0901d38c137cdbb62f48d662fb6ecedebe3431e28df9e9e')]:
 p=root/name;before=p.lstat();assert stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_uid==0 and not p.is_symlink()
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  opened=os.fstat(fd);assert (opened.st_dev,opened.st_ino)==(before.st_dev,before.st_ino)
  with os.fdopen(fd,'rb',closefd=False) as f:b=f.read(size+1)
  afterfd=os.fstat(fd);after=p.lstat()
  key=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
  assert key(before)==key(opened)==key(afterfd)==key(after) and len(b)==size and hashlib.sha256(b).hexdigest()==h
 finally:os.close(fd)
 items.append({'name':name,'bytes':size,'sha256':h,'stableLstatFstat':True});contents.append(b)
header=json.dumps({'files':items,'scope':'exact owned retained bytes; no new official network request/data write/cleanup'}).encode()
sys.stdout.buffer.write(str(len(header)).encode()+b'\n'+header+b''.join(contents))
PY

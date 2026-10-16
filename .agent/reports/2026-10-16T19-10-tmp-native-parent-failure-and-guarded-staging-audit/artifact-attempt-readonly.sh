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
from pathlib import Path
import os,stat,hashlib,json,datetime,re
base=Path('/tmp/stockinsider-official-docs.qAIVaj');rows=[]
try:
 s=base.lstat()
 if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid!=0:raise RuntimeError('known_artifact_directory_identity_mismatch')
 exists=True
except FileNotFoundError:exists=False
if exists:
 for symbol in ['1735','1786','2324','2327','2385']:
  p=base/(symbol+'.xhtml')
  try:
   s=p.lstat()
   if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_nlink!=1 or not (0<s.st_size<=52428800):raise RuntimeError('known_artifact_file_identity_or_bound_mismatch')
   fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
   try:
    f=os.fstat(fd)
    if (f.st_dev,f.st_ino,f.st_size)!=(s.st_dev,s.st_ino,s.st_size):raise RuntimeError('known_artifact_identity_changed')
    h=hashlib.sha256();sample=b'';n=0
    while True:
     chunk=os.read(fd,1048576)
     if not chunk:break
     h.update(chunk);n+=len(chunk)
     if len(sample)<65536:sample+=(chunk[:65536-len(sample)])
    if n!=s.st_size:raise RuntimeError('known_artifact_size_changed')
   finally:os.close(fd)
   text=sample.decode('utf-8',errors='replace')
   rows.append({'symbol':symbol,'leaf':p.name,'present':True,'bytes':n,'sha256':h.hexdigest(),'mode':oct(stat.S_IMODE(s.st_mode)),'uid':s.st_uid,'nlink':s.st_nlink,'first64KiBInlineXbrlNamespace':bool(re.search(r'(?:xmlns:ix|www\.xbrl\.org/2013/inlineXBRL)',text,re.I)),'first64KiBHtmlElement':bool(re.search(r'<(?:[A-Za-z]+:)?html\b',text,re.I)),'first64KiBHasReplacementCharacter':'\ufffd' in text,'companyPeriodAndArelleValidation':'NOT_RUN'})
  except FileNotFoundError:rows.append({'symbol':symbol,'leaf':p.name,'present':False})
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'currentReleasePathVerified':'dd59817f750684b093965f539dd4de466be13077','knownDirectory':str(base),'directoryPresent':exists,'files':rows,'scope':'retained byte identity/read-only format indicators only; no document validation, download, upload or parser execution'},ensure_ascii=False))
PY

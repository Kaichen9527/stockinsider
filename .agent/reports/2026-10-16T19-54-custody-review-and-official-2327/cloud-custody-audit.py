import os,stat,pathlib,json,hashlib,datetime,subprocess,resource
W=pathlib.Path('/tmp/generated-custody-o16');P=pathlib.Path('/workspace/stockinsider');R=pathlib.Path('/tmp/si-pubtail-o14');uid=os.getuid();floor=8589934592
sha=lambda b:hashlib.sha256(b).hexdigest();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
refbytes=(W/'approved-dd-output-hash-reference.json').read_bytes();assert sha(refbytes)=='2dfb0f78f3a6b63fc7f11d5ceaaa60335b98a184ee94cfb4ae8f81464ee245cd';ref=json.loads(refbytes);assert ref['subject']=='dd59817f750684b093965f539dd4de466be13077';assert ref['selectedCount']==1371
reference={f['cloudRelativePath']:f for f in ref['files']};assert len(reference)==1371 and sum(f['bytes'] for f in reference.values())==14966550
priorpath=pathlib.Path('/tmp/guarded-staging-audit-o16/generated-hashes-private.json');assert sha(priorpath.read_bytes())=='7365da3e1163c6ae73ec8fd1e2dbf1c8edd9b0e25d8e3f8cb35dbf1d48bc718a';prior={x['path']:x for x in json.loads(priorpath.read_text())}
def sm(s):return {'dev':s.st_dev,'inode':s.st_ino,'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'nlink':s.st_nlink,'bytes':s.st_size,'mtimeNs':s.st_mtime_ns,'ctimeNs':s.st_ctime_ns,'allocatedBytes':s.st_blocks*512}
def sig(s):return tuple(getattr(s,k) for k in ['st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink','st_size','st_mtime_ns','st_ctime_ns'])
def parents(p):
 out=[]
 for q in list(p.parents)[::-1]:
  s=os.lstat(q)
  if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode):raise ValueError('parent_not_nosymlink_directory')
  out.append((str(q),sig(s)))
 return out
free=lambda:{p:os.statvfs(p).f_bavail*os.statvfs(p).f_frsize for p in ['/workspace','/tmp']}
start=now();pre=free();assert min(pre.values())>=floor
rows=[];dirs=0;entrycount=0;readbytes=0;limit=20*1024*1024;rootmeta=[]
for rel in ['web/.next/server','web/.next/static']:
 root=P/rel;rootmeta.append({'path':rel,'metadata':sm(os.lstat(root)),'ancestors':[{'path':q,'metadata':sm(os.lstat(q))} for q,_ in parents(root)]});stack=[root]
 while stack:
  p=stack.pop();entrycount+=1
  if entrycount>20000:raise RuntimeError('entry_bound')
  s=os.lstat(p);relpath=str(p.relative_to(P))
  if stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode):
   if s.st_uid!=uid:raise RuntimeError('non_self_owned_directory')
   dirs+=1
   for e in os.scandir(p):
    if e.name in ['cache','.cache','node_modules','.git'] or e.name.startswith('.env'):raise RuntimeError('excluded_path_encountered')
    stack.append(pathlib.Path(e.path))
   continue
  row={'path':relpath,'metadataBefore':sm(s),'status':'ERROR'};fd=None
  try:
   if not stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid!=uid or s.st_nlink!=1:raise ValueError('regular_nosymlink_selfowner_nlink1_required')
   chain=parents(p);fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW);f0=os.fstat(fd)
   if sig(s)!=sig(f0):row['status']='CHANGED';raise ValueError('open_identity_changed')
   h=hashlib.sha256();n=0
   while True:
    b=os.read(fd,min(65536,limit-readbytes+1))
    if not b:break
    readbytes+=len(b);n+=len(b)
    if readbytes>limit:raise RuntimeError('20MiB_read_bound')
    h.update(b)
   f1=os.fstat(fd);s1=os.lstat(p);chain1=parents(p);row.update({'metadataOpened':sm(f0),'metadataFdAfter':sm(f1),'metadataPathAfter':sm(s1),'readBytes':n,'sha256':h.hexdigest(),'openedFd':fd,'closed':False,'ancestorsStable':chain==chain1})
   if not(sig(s)==sig(f0)==sig(f1)==sig(s1) and chain==chain1 and n==s.st_size):row['status']='CHANGED'
   else:
    z=reference.get(relpath);row['stable']=True;row['reference']=z;row['status']='NO_REFERENCE' if z is None else ('EXACT_MATCH' if n==z['bytes'] and row['sha256']==z['sha256'] else 'MISMATCH');row['referenceModeEqual']=None if z is None else stat.S_IMODE(s.st_mode)==z.get('mode');old=prior.get(relpath);row['priorAuditByteEqual']=old is not None and old['bytes']==n and old['sha256']==row['sha256']
  except Exception as e:row['error']=str(e)
  finally:
   if fd is not None:os.close(fd);row['closed']=True
  rows.append(row)
# Match only candidate refs in same-uid cwd/fd; no other target names, command lines or environments retained.
usage=[];errors=0;pc=0;fc=0;prefixes=[str(P/'web/.next/server'),str(P/'web/.next/static')]
for q in pathlib.Path('/proc').iterdir():
 if not q.name.isdigit():continue
 try:
  if q.stat().st_uid!=uid:continue
  pc+=1
  if pc>4096:break
  try:
   t=os.readlink(q/'cwd')
   for prefx in prefixes:
    if t==prefx or t.startswith(prefx+'/'):usage.append({'pid':int(q.name),'kind':'cwd','candidate':prefx})
  except OSError:errors+=1
  try:
   for f in (q/'fd').iterdir():
    if fc>=20000:break
    fc+=1
    try:
     t=os.readlink(f)
     for prefx in prefixes:
      if t==prefx or t.startswith(prefx+'/'):usage.append({'pid':int(q.name),'kind':'fd','candidate':prefx})
    except OSError:errors+=1
  except OSError:errors+=1
 except OSError:errors+=1
tracked=subprocess.check_output(['git','ls-files','-z','--','web/.next/server','web/.next/static'],cwd=P);assert not tracked
counts={k:{'count':0,'logicalBytes':0,'allocatedBytes':0} for k in ['EXACT_MATCH','MISMATCH','NO_REFERENCE','CHANGED','ERROR']}
for row in rows:
 x=counts[row['status']];x['count']+=1;x['logicalBytes']+=row['metadataBefore']['bytes'];x['allocatedBytes']+=row['metadataBefore']['allocatedBytes']
markers=[]
for rel in ['web/.next/BUILD_ID','web/.next/build-manifest.json']:
 p=P/rel
 try:
  s=os.lstat(p);assert stat.S_ISREG(s.st_mode) and not stat.S_ISLNK(s.st_mode);fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
  try:
   f=os.fstat(fd);b=os.read(fd,1048577);f1=os.fstat(fd);s1=os.lstat(p);assert len(b)<=1048576 and sig(s)==sig(f)==sig(f1)==sig(s1);markers.append({'path':rel,'bytes':len(b),'sha256':sha(b),'stable':True})
  finally:os.close(fd)
 except FileNotFoundError:markers.append({'path':rel,'absent':True})
post=free();assert min(post.values())>=floor
(W/'per-file-custody-private.json').write_text(json.dumps(rows,indent=2)+'\n')
summary={'start':start,'end':now(),'actorUid':uid,'scope':'actual execution-context read-only; current Cloud bytes compared to Root hash-only retained-DD reference','referenceCommit':'dc9509066226af655872ceebe7e41c60d0104327','referenceSha256':sha(refbytes),'referenceProvenance':{k:v for k,v in ref.items() if k!='files'},'priorCloudHashInventorySha256':sha(priorpath.read_bytes()),'entryCount':entrycount,'directories':dirs,'regularFileRows':len(rows),'readBytes':readbytes,'readBudgetBytes':limit,'categories':counts,'exactMatchMeaning':'same relative path/size/SHA; mode equality reported separately, no Cloud package provenance or rebuildability claim','all621PriorAuditBytesEqual':len(rows)==621 and all(r.get('priorAuditByteEqual') for r in rows),'allOpenedFdsClosed':all(r.get('closed') for r in rows),'modeEqualReferenceCount':sum(r.get('referenceModeEqual') is True for r in rows),'rootMetadata':rootmeta,'gitTrackedCount':0,'buildIdentityMarkers':markers,'processReferences':{'sameUidProcessCount':pc,'fdReadlinkCount':fc,'errorsOrRaces':errors,'matches':usage,'unreferencedProven':False},'capacity':{'floor':floor,'before':pre,'after':post,'maxRssBytesAuditProcess':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,'notWholeEnvironmentRss':True},'perFileInventorySha256':sha((W/'per-file-custody-private.json').read_bytes()),'safeDeletionCandidates':[],'cleanupAuthorizedOrExecuted':False,'nativeReady':False,'unreferenced':'UNKNOWN','exactRebuildability':'UNKNOWN','noContentPublished':True}
(W/'custody-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'categories':counts,'readBytes':readbytes,'priorEqual':summary['all621PriorAuditBytesEqual'],'modeEqual':summary['modeEqualReferenceCount'],'processReferences':summary['processReferences'],'capacity':summary['capacity']}))

import ast,copy,hashlib,json,os,pathlib,stat,tarfile,tempfile,zipfile
root=pathlib.Path(__file__).parent
text=(root/'exact-extractor.py').read_text();tree=ast.parse(text)
def block(nodes):return compile(ast.Module(body=nodes,type_ignores=[]),'exact-workflow-extract','exec')
results=[]
def check(label,call,accept):
 try:call();ok=True;err=None
 except (AssertionError,KeyError,FileNotFoundError) as e:ok=False;err=type(e).__name__
 assert ok==accept,(label,ok,accept);results.append({'case':label,'expected':'accept'if accept else'reject','result':'PASS','error':err})
# Execute exact metadata prefix, stopping before opening any binary archive.
nodes=tree.body;end=next(i for i,n in enumerate(nodes)if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='archive'for t in n.targets));prefix=block(nodes[:end])
meta={'id':11904225538,'name':'reviewed-linux-standalone-dd59817f750684b093965f539dd4de466be13077-38580440366-success','size_in_bytes':28254621,'expired':False,'digest':'sha256:c3006c864a95d8cebb022d32d848baccec7ba99cfe95b9a1a6f446e7e002caed','workflow_run':{'id':38580440366,'repository_id':1169909279,'head_repository_id':1169909279,'head_sha':'e902021ee9df537d4a8da2a2eaff3921084d44d7'}}
run={'id':38580440366,'status':'completed','conclusion':'success','repository':{'id':1169909279},'head_sha':'e902021ee9df537d4a8da2a2eaff3921084d44d7'}
with tempfile.TemporaryDirectory(prefix='metadata-',dir=root)as d:
 os.environ['RUNNER_TEMP']=d;p=pathlib.Path(d)/'standalone-export';p.mkdir()
 def metadata(m=meta,r=run):
  (p/'upstream-artifact-metadata.json').write_text(json.dumps(m));(p/'upstream-run.json').write_text(json.dumps(r));exec(prefix,{})
 check('fixed metadata control (synthetic, not API)',metadata,True)
 for field,value in [('id',1),('name','other'),('size_in_bytes',1),('expired',True),('digest','sha256:'+'0'*64)]:
  m=copy.deepcopy(meta);m[field]=value;check('metadata '+field,lambda m=m:metadata(m),False)
 for field in ['id','repository_id','head_repository_id','head_sha']:
  m=copy.deepcopy(meta);m['workflow_run'][field]='wrong';check('artifact run '+field,lambda m=m:metadata(m),False)
 for field,value in [('status','in_progress'),('conclusion','failure'),('head_sha','0'*40),('id',1)]:
  r=copy.deepcopy(run);r[field]=value;check('run '+field,lambda r=r:metadata(meta,r),False)
# Execute exact tar path/type/mode/duplicate guard, without extraction or a built artifact.
idx=next(i for i,n in enumerate(nodes)if isinstance(n,ast.With)and'tarfile.open'in ast.unparse(n))
body=nodes[idx].body;start=next(i for i,n in enumerate(body)if isinstance(n,ast.Assign)and ast.unparse(n).startswith('paths ='))
pathguard=block(body[start:start+2]);source='dd59817f750684b093965f539dd4de466be13077'
def member(name=None,kind=tarfile.REGTYPE,mode=0o644):
 m=tarfile.TarInfo(name or source+'/app/file.js');m.type=kind;m.mode=mode;return m
def guard(ms):exec(pathguard,{'members':ms,'PurePosixPath':pathlib.PurePosixPath,'source':source})
check('tar regular+directory control',lambda:guard([member(source,tarfile.DIRTYPE,0o755),member()]),True)
for name in ['/escape',source+'/../escape',source+'/./file',source+'//file',source+'/a\\b','wrong/app/file']:
 check('tar bad path '+name,lambda name=name:guard([member(name)]),False)
for kind in [tarfile.SYMTYPE,tarfile.LNKTYPE,tarfile.FIFOTYPE,tarfile.CHRTYPE,tarfile.BLKTYPE]:check('tar special '+repr(kind),lambda kind=kind:guard([member(kind=kind)]),False)
for mode in [0o4755,0o2755,0o1755]:check('tar privilegedmode '+oct(mode),lambda mode=mode:guard([member(mode=mode)]),False)
check('tar duplicate',lambda:guard([member(),member()]),False)
# Original ZIP loop with real small hermetic ZIPs; whole fixed ZIP SHA independently precedes this loop.
zn=next(n for n in nodes if isinstance(n,ast.With)and'zipfile.ZipFile'in ast.unparse(n));zipguard=block([zn]);expected={'SHA256SUMS','builder-canonical.log','builder-canonical.tap','builder-correctness.json','package.json','packaged-boot.json','packaged-boot.stderr','packaged-boot.stdout','release-manifest.json','review-binding.json','source-identity.txt','stockinsider-linux.tar.gz','verification.json'}
with tempfile.TemporaryDirectory(prefix='zip-',dir=root)as d:
 base=pathlib.Path(d)
 def zcase(mode):
  archive=base/(mode+'.zip');upstream=base/mode;upstream.mkdir()
  names=sorted(expected)
  if mode=='missing':names.pop()
  if mode=='unknown':names[-1]='unknown'
  if mode=='traversal':names[-1]='../escape'
  if mode=='duplicate':names[-1]=names[0]
  with zipfile.ZipFile(archive,'w')as z:
   for i,name in enumerate(names):
    zi=zipfile.ZipInfo(name);zi.external_attr=(stat.S_IFLNK|0o777)<<16 if mode=='symlink'and i==0 else (stat.S_IFREG|0o600)<<16;z.writestr(zi,b'x')
  exec(zipguard,{'zipfile':zipfile,'archive':archive,'expected':expected,'stat':stat,'upstream':upstream})
 for mode in ['valid','missing','unknown','traversal','duplicate','symlink']:check('zip '+mode,lambda mode=mode:zcase(mode),mode=='valid')
(root/'raw/predicate-results.json').write_text(json.dumps({'scope':'isolated exact AST predicates; NOT full artifact validation/hosted workflow','checks':results,'pass':len(results),'fail':0},indent=2))
print(json.dumps({'pass':len(results),'fail':0,'scope':'exact metadata/tar/zip predicates only'}))

import pathlib,importlib.util,tempfile,os,json,hashlib
p=pathlib.Path(__file__).parent
spec=importlib.util.spec_from_file_location('candidate_support',p/'operator-support.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
out=[]
def test(name,fn):fn();out.append(name)
def rejects(fn):
 try:fn()
 except (AssertionError,OSError,ValueError):return
 raise AssertionError('expected rejection')
with tempfile.TemporaryDirectory(prefix='si-root-dd-profile-') as d:
 f=pathlib.Path(d)/'nonsecret';f.write_bytes(b'fixed\n');f.chmod(0o600)
 def valid():
  x=m.read_fixed(f,b'fixed\n',os.getuid(),os.getgid(),0o600);assert x['sha256']==hashlib.sha256(b'fixed\n').hexdigest()
 test('exact bounded profile',valid)
 for name,args in [('extra bytes',(f,b'fixed',os.getuid(),os.getgid(),0o600)),('wrong owner',(f,b'fixed\n',os.getuid()+1,os.getgid(),0o600)),('wrong group',(f,b'fixed\n',os.getuid(),os.getgid()+1,0o600)),('wrong mode',(f,b'fixed\n',os.getuid(),os.getgid(),0o640)),('missing',(pathlib.Path(d)/'absent',b'fixed\n',os.getuid(),os.getgid(),0o600))]:test(name,lambda args=args:rejects(lambda:m.read_fixed(*args)))
 link=pathlib.Path(d)/'symbolic';link.symlink_to(f);test('symlink rejects',lambda:rejects(lambda:m.read_fixed(link,b'fixed\n',os.getuid(),os.getgid(),0o600)))
 hard=pathlib.Path(d)/'hard';os.link(f,hard);test('hardlink rejects',lambda:rejects(lambda:m.read_fixed(f,b'fixed\n',os.getuid(),os.getgid(),0o600)));hard.unlink()
 for name in ['stockinsider-web-standalone.service','stockinsider-internal-worker.service']:
  test(name+' exact effective identity',lambda name=name:m.assert_effective(name,m.expected_effective(name)))
  for key,value in [('DropInPaths','/unknown.conf'),('FragmentPath','/unknown.service'),('NeedDaemonReload','yes'),('User','root')]:test(name+' rejects '+key,lambda name=name,key=key,value=value:rejects(lambda:m.assert_effective(name,{**m.expected_effective(name),key:value})))
 test('unknown extra effective field',lambda:rejects(lambda:m.assert_effective('stockinsider-web-standalone.service',{**m.expected_effective('stockinsider-web-standalone.service'),'Unknown':'1'})))
 def swapped_name():
  original=m.os.read;done=[]
  def read(fd,n):
   data=original(fd,n)
   if not done:
    done.append(True);replacement=pathlib.Path(d)/'replacement';replacement.write_bytes(b'fixed\n');replacement.chmod(0o600);replacement.replace(f)
   return data
  m.os.read=read
  try:rejects(lambda:m.read_fixed(f,b'fixed\n',os.getuid(),os.getgid(),0o600))
  finally:m.os.read=original
 test('same bytes at replaced pathname still rejected',swapped_name)
assert len(out)==20
print(json.dumps({'rootPortableProfileGroups':len(out),'pass':len(out),'fail':0,'cases':out,'linuxSupervisorExecuted':False,'productionProfileExecuted':False,'scope':'import-inert support and scratch-file functions only'}))

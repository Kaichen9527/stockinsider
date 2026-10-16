import ast, hashlib, json, re, subprocess
from pathlib import Path
R=Path('/tmp/stockinsider-discovery-release-root-review-oct14')
O=Path('/tmp/stockinsider-parser-lifecycle-binding-review-oct17')
B='831127a05a99c83b7c3e6f9e5615ccded58a1bb5';S='bac16865eb6abac4e726a2459ca48dc1f73d55c7';E='22b155500d7b319611495a166effe84f9d657b1c'
P='docs/operations/2026-10-17/parser-runtime-directory-lifecycle/'
def g(*a):return subprocess.check_output(['git',*a],cwd=R)
def b(v,p):return g('show',v+':'+p)
def h(x):return hashlib.sha256(x).hexdigest()
def tree(v):return {x.split(b'\t',1)[1].decode():x.split(b'\t',1)[0].decode() for x in g('ls-tree','-rz',v).split(b'\0') if x}
assert g('show','-s','--format=%P',S).decode().strip()==B and g('show','-s','--format=%P',E).decode().strip()==S
bt,st,et=map(tree,[B,S,E]);changed=[p for p in bt if bt[p]!=st[p]];assert changed==['scripts/parser-runtime-directory-lifecycle.py']
seal=json.loads(b(E,P+'r1-evidence/source-seal.json'));assert len(seal['inputs'])==10
for row in seal['inputs']:
 raw=b(S,row['path']);assert len(raw)==row['bytes'] and h(raw)==row['sha256'] and st[row['path']]==row['gitIdentity']
assert sum(x['bytes'] for x in seal['inputs'])==60534
receipt_raw=b(E,P+'r1-evidence/receipt.json');assert h(receipt_raw)=='e21c0a93432f733dc4c0c2277e6ce4789a4fa518474440d2fcb0d105a592ea87'
receipt=json.loads(receipt_raw);n=0
for row in receipt['files']:
 raw=b(E,P+'r1-evidence/'+row['name']);assert len(raw)==row['bytes'] and h(raw)==row['sha256'];n+=len(raw);(O/('maker-'+row['name'])).write_bytes(raw)
(O/'maker-receipt.json').write_bytes(receipt_raw);assert n+len(receipt_raw)==9757
inventory=json.loads(b(E,P+'r1-evidence/raw-inventory.json'));assert len(inventory['files'])==inventory['count']==13 and sum(x['bytes'] for x in inventory['files'])==inventory['bytes']==71247
assert all(re.fullmatch('[0-9a-f]{64}',x['sha256']) for x in inventory['files'])
old=b(B,'scripts/parser-runtime-directory-lifecycle.py');new=b(S,'scripts/parser-runtime-directory-lifecycle.py')
start=new.index(b'        result.update(harnessSha256=lab.script_hash, workflowSha256=lab.workflow_hash,\n')
end=new.index(b"        write_json(lab.output / 'receipt.json', result)\n",start)
insert=new[start:end];assert len(insert)==1247 and new[:start]+new[end:]==old
for p in ['.github/workflows/parser-runtime-lifecycle-quality.yml','deployment/vps/systemd/stockinsider-web-standalone.service']:assert b(B,p)==b(S,p)==b(E,p)
mod=ast.parse(new);compile(mod,'<new source syntax only>','exec');main=next(x for x in mod.body if isinstance(x,ast.FunctionDef) and x.name=='main')
workflow=b(S,'.github/workflows/parser-runtime-lifecycle-quality.yml');unit=b(S,'deployment/vps/systemd/stockinsider-web-standalone.service')
class Bytes:
 def __init__(self,v):self.v=v
 def read_bytes(self):return self.v
def probe(mode):
 files={}
 class MemoryPath:
  def __init__(self,name):self.name=name
  def __truediv__(self,name):return MemoryPath(name)
  def read_bytes(self):return files[self.name]
 class FakeLab:
  def __init__(self,output):
   self.output=MemoryPath('memory-only');self.script=Bytes(new);self.script_hash=h(new);self.workflow_hash=h(workflow)
   self.cases=[];self.units={'fixture':'synthetic-only'};self.events=[{'event':'source contract only'}];self.violation=None;self.minimum={};self.peak=0
  def admission(self):
   if mode=='NOT_READY':raise RuntimeError('synthetic admission refusal')
  def case(self,name,fn):
   if mode=='FAIL':raise RuntimeError('synthetic case refusal')
   self.cases.append({'case':name,'synthetic':True})
  def candidate(self,fields):self.cases.extend({'case':str(i),'synthetic':True} for i in range(3))
  def cleanup(self):return {'confirmed':mode!='CLEANUP_UNKNOWN'}
  def postrun(self):return {'confirmed':True}
 def write(p,v):
  if p.name=='source-pins.json' and mode=='PIN_MISMATCH':v={**v,'unitSha256':'0'*64}
  files[p.name]=(json.dumps(v,sort_keys=True,indent=2)+'\n').encode()
 ns={'Lab':FakeLab,'semantics':lambda:{},'write_json':write,'digest':h,'WORKFLOW':Bytes(workflow),'UNIT':Bytes(unit),'FROZEN':h(unit),'ORIGINAL':'original','json':json,'print':lambda *a,**k:None}
 exec(compile(ast.Module(body=[main],type_ignores=[]),'<exact main memory adapters>','exec'),ns)
 code=ns['main']('unused');result=json.loads(files['receipt.json'])
 assert code==(0 if mode=='PASS' else 1)
 assert result['status']==('PASS' if mode=='PASS' else ('NOT_READY' if mode=='NOT_READY' else 'FAIL'))
 assert result['harnessSha256']==h(new) and result['workflowSha256']==h(workflow) and result['unitSha256']==h(unit)
 assert result['inputSeal']=='source-pins.json'
 assert [x['name'] for x in result['evidenceInventory']]==['events.json','fixture-units.json','source-pins.json']
 for row in result['evidenceInventory']:assert row=={'name':row['name'],'bytes':len(files[row['name']]),'sha256':h(files[row['name']])}
 if mode=='PIN_MISMATCH':assert result['evidenceBindingErrors']==[{'name':'source-pins.json','error':'ValueError'}]
 else:assert 'evidenceBindingErrors' not in result
 if mode=='PASS':
  for row in result['evidenceInventory']:assert h(files[row['name']]+b' ')!=row['sha256']
 return {'mode':mode,'returnCode':code,'status':result['status'],'scope':'memory-only orchestration, not native/lifecycle'}
probes=[probe(x) for x in ['PASS','FAIL','NOT_READY','CLEANUP_UNKNOWN','PIN_MISMATCH']]
subprocess.run(['git','diff','--check',B,E],cwd=R,check=True)
out={'source':S,'evidence':E,'sourceInputs':seal['inputs'],'actualSourceCount':10,'actualSourceBytes':60534,'publishedFiles':6,'publishedBytes':9757,'privateInventoryOnlyCount':13,'privateInventoryOnlyBytes':71247,'privateContentsObtained':False,'inheritedIdentitiesUnchanged':len(bt)-1,'newSourcePaths':sorted(set(st)-set(bt)),'exactInverseInsertionBytes':len(insert),'insertionSha256':h(insert),'rootContractProbes':probes,'oneByteDriftRejects':3,'rangeDiffCheck':'PASS','R1SourceContractClosed':True,'native':'NOT_RUN','scopedFindings':{'P0':0,'P1':0,'P2':0}}
(O/'root-check.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k!='sourceInputs'}))

import ast, hashlib, json, re, subprocess
from pathlib import Path

REPO=Path('/tmp/stockinsider-discovery-release-root-review-oct14')
OUT=Path('/tmp/stockinsider-parser-lifecycle-review-oct17')
BASE='1f5f3fcacbf16c988e3717b233711c91da0284a0'
SOURCE='76bcc2629a7417b224d47229d7d5b4973631b053'
EVIDENCE='831127a05a99c83b7c3e6f9e5615ccded58a1bb5'
PREFIX='docs/operations/2026-10-17/parser-runtime-directory-lifecycle/'
def git(*args): return subprocess.check_output(['git',*args],cwd=REPO)
def blob(rev,p): return git('show',rev+':'+p)
def sha(b): return hashlib.sha256(b).hexdigest()
def entries(rev):
 return {x.split(b'\t',1)[1].decode():x.split(b'\t',1)[0].decode() for x in git('ls-tree','-rz',rev).split(b'\0') if x}
def parents(rev):return git('show','-s','--format=%P',rev).decode().strip().split()
assert parents(SOURCE)==[BASE] and parents(EVIDENCE)==[SOURCE]
base,source,evidence=map(entries,[BASE,SOURCE,EVIDENCE])
assert all(source[p]==v and evidence[p]==v for p,v in base.items())
assert set(source)-set(base)=={'scripts/parser-runtime-directory-lifecycle.py','.github/workflows/parser-runtime-lifecycle-quality.yml',PREFIX+'HANDOFF.md'}
seal=json.loads(blob(EVIDENCE,PREFIX+'evidence/source-seal.json'))
source_rows=[]
for x in seal['files']:
 b=blob(SOURCE,x['path']);assert len(b)==x['bytes'] and sha(b)==x['sha256'] and git('rev-parse',SOURCE+':'+x['path']).decode().strip()==x['blob']
 source_rows.append({'revision':SOURCE,**x})
for rev,p in [('93e44475cbb0c27beb26e4dcb68e382096a4e212','deployment/vps/systemd/stockinsider-web-standalone.service')]+[(BASE,p) for p in ['deployment/vps/systemd/stockinsider-financial-parser.socket','deployment/vps/systemd/stockinsider-financial-parser.service','scripts/candidate_financial_parser_socket.py']]:
 b=blob(rev,p);source_rows.append({'revision':rev,'path':p,'bytes':len(b),'sha256':sha(b)})
assert source_rows[3]['sha256']=='7a948b2732c02595fe5100bb10206e99c58401c4f8921a7230fa66da373397a5'
assert sha(blob(SOURCE,source_rows[3]['path']).replace(b'RuntimeDirectoryPreserve=yes\n',b'',1))==source_rows[4]['sha256']
receipt_bytes=blob(EVIDENCE,PREFIX+'evidence/receipt.json');receipt=json.loads(receipt_bytes)
assert sha(receipt_bytes)=='b9138032ccb0cdc149fb77e019f0cb1acff4b41a533f02aa8dd783f9daf7bbad'
published=[]
for x in receipt['files']:
 b=blob(EVIDENCE,PREFIX+'evidence/'+x['path']);assert len(b)==x['bytes'] and sha(b)==x['sha256']
 published.append(x);(OUT/('maker-'+x['path'])).write_bytes(b)
(OUT/'maker-receipt.json').write_bytes(receipt_bytes)
assert len(published)==10 and sum(x['bytes'] for x in published)==14917
inventory=json.loads(blob(EVIDENCE,PREFIX+'evidence/raw-inventory.json'))
assert inventory['count']==len(inventory['files'])==24 and inventory['bytes']==sum(x['bytes'] for x in inventory['files'])==105829
assert all(re.fullmatch('[0-9a-f]{64}',x['sha256']) for x in inventory['files'])
harness=blob(SOURCE,'scripts/parser-runtime-directory-lifecycle.py')
tree=ast.parse(harness);compile(tree,'<frozen harness parse only>','exec')
main_node=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='main')
# Execute only frozen orchestration with isolated in-memory adapters. No imports,
# native assertions, OS/systemd/socket/filesystem operations or runtime PASS claim.
class Bytes:
 def __init__(self,b):self.b=b
 def read_bytes(self):return self.b
captured={}
class FakeLab:
 def __init__(self,output):
  self.output=Path('/isolated-memory-only');self.script=Bytes(harness);self.script_hash=sha(harness)
  self.workflow_hash=sha(blob(SOURCE,'.github/workflows/parser-runtime-lifecycle-quality.yml'))
  self.cases=[];self.units={};self.events=[];self.violation=None;self.minimum={};self.peak=0
 def admission(self):pass
 def case(self,label,fn):self.cases.append({'case':label,'status':'PASS','syntheticContractAdapter':True})
 def candidate(self,fields):self.cases.extend({'case':str(i),'status':'PASS','syntheticContractAdapter':True} for i in range(3))
 def cleanup(self):return {'confirmed':True}
 def postrun(self):return {'confirmed':True}
wf=blob(SOURCE,'.github/workflows/parser-runtime-lifecycle-quality.yml');unit=blob(SOURCE,'deployment/vps/systemd/stockinsider-web-standalone.service')
ns={'Lab':FakeLab,'semantics':lambda:{},'write_json':lambda p,v:captured.__setitem__(p.name,v),'digest':sha,'WORKFLOW':Bytes(wf),'UNIT':Bytes(unit),'FROZEN':sha(unit),'ORIGINAL':source_rows[4]['sha256'],'json':json,'print':lambda *a,**k:None}
exec(compile(ast.Module(body=[main_node],type_ignores=[]),'<isolated frozen main only>','exec'),ns)
assert ns['main']('unused')==0
runtime_receipt=captured['receipt.json'];pins=captured['source-pins.json']
assert all(k in pins for k in ['harnessSha256','workflowSha256','unitSha256'])
assert all(k not in runtime_receipt for k in ['harnessSha256','workflowSha256','unitSha256'])
assert not any(k in runtime_receipt for k in ['files','evidence','evidenceFiles','sourcePins','sourcePinsSha256'])
binding_probe={'scope':'isolated frozen main orchestration with memory-only adapters; no lifecycle/native evidence','contract':'future runtime receipt binds exact harness/workflow/unit and evidence file bytes/hash','result':'FAIL','runtimeReceiptKeys':sorted(runtime_receipt),'separateSourcePinsKeys':sorted(pins),'native':'NOT_RUN','finding':'R1 receipt lacks input/evidence binding even when frozen main selects PASS in an isolated contract adapter'}
(OUT/'runtime-receipt-binding-probe.json').write_text(json.dumps(binding_probe,indent=2)+'\n')
subprocess.run(['git','diff','--check',BASE,EVIDENCE],cwd=REPO,check=True)
summary={'source':SOURCE,'evidence':EVIDENCE,'base':BASE,'sourceInputs':source_rows,'sourceInputCount':len(source_rows),'sourceInputBytes':sum(x['bytes'] for x in source_rows),'publishedFilesIncludingReceipt':11,'publishedBytesIncludingReceipt':sum(x['bytes'] for x in published)+len(receipt_bytes),'inheritedEntriesUnchanged':len(base),'newSourceEntries':3,'newEvidenceEntries':len(set(evidence)-set(source)),'privateInventoryOnlyCount':24,'privateInventoryOnlyBytes':105829,'privateContentsObtained':False,'makerSourceGroups':19,'makerNative':'NOT_RUN','rootBindingProbe':'FAIL/R1/source-contract-only','rangeDiffCheck':'PASS','scopedReview':'REQUEST_CHANGES','findings':{'P0':0,'P1':0,'P2':1}}
(OUT/'root-check.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='sourceInputs'}))

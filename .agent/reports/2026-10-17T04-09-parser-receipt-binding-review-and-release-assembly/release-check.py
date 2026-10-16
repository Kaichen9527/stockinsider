import ast,hashlib,json,re,subprocess
from pathlib import Path
R=Path('/tmp/stockinsider-discovery-release-root-review-oct14');O=Path('/tmp/stockinsider-parser-lifecycle-binding-review-oct17')
B='93e44475cbb0c27beb26e4dcb68e382096a4e212';C='bac16865eb6abac4e726a2459ca48dc1f73d55c7';S='388fd4f802ce06689a8f8401d0c4b17806c503f7';E='099f4dbcfd165ce6406bf0624e3ae299a2319cd9';P='docs/operations/2026-10-17/parser-runtime-lifecycle-release/'
def g(*a):return subprocess.check_output(['git',*a],cwd=R)
def blob(v,p):return g('show',v+':'+p)
def sha(b):return hashlib.sha256(b).hexdigest()
def tree(v):return {x.split(b'\t',1)[1].decode():x.split(b'\t',1)[0].decode() for x in g('ls-tree','-rz',v).split(b'\0') if x}
assert g('show','-s','--format=%P',S).decode().strip()==B and g('show','-s','--format=%P',E).decode().strip()==S
paths=['deployment/vps/systemd/stockinsider-web-standalone.service','scripts/parser-runtime-directory-lifecycle.py','.github/workflows/parser-runtime-lifecycle-quality.yml','docs/operations/2026-10-17/parser-runtime-directory-lifecycle/HANDOFF.md','docs/operations/2026-10-17/parser-runtime-directory-lifecycle/R1-RECEIPT-BINDING.md','docs/operations/2026-10-17/parser-runtime-directory-lifecycle/receipt-binding-source-checks.py']
bt,st,et=map(tree,[B,S,E]);assert all(bt[p]==st[p] for p in bt if p!=paths[0]);assert len(bt)-1==2199
assert set(st)-set(bt)==set(paths[1:]+[P+'HANDOFF.md'])
rows=[]
for p in paths+[P+'HANDOFF.md']:
 b=blob(S,p);assert blob(E,p)==b
 if p in paths:assert blob(C,p)==b
 if p.endswith('.py'):compile(ast.parse(b),p,'exec')
 rows.append({'path':p,'gitIdentity':st[p],'bytes':len(b),'sha256':sha(b)})
unit=blob(S,paths[0]);assert unit.replace(b'RuntimeDirectoryPreserve=yes\n',b'',1)==blob(B,paths[0])
raw=blob(E,P+'evidence/receipt.json');assert sha(raw)=='2e4555424e94c05314c7ffa2e0ecc4d023b42347337121d1fc8b503846b79d7f'
rec=json.loads(raw);(O/'assembly-maker-receipt.json').write_bytes(raw)
print('receipt_shape',sorted(rec))
for x in rec['files']:
 name=x.get('name',x.get('path'));d=blob(E,P+'evidence/'+name);assert len(d)==x['bytes'] and sha(d)==x['sha256'];(O/('assembly-maker-'+name)).write_bytes(d)
inventory=json.loads(blob(E,P+'evidence/raw-inventory.json'));print('raw_inventory_shape',sorted(inventory))
assert inventory['count']==len(inventory['files'])==4 and sum(x['bytes'] for x in inventory['files'])==inventory['bytes']==7801
assert all(re.fullmatch('[0-9a-f]{64}',x['sha256']) for x in inventory['files'])
subprocess.run(['git','diff','--check',B,S],cwd=R,check=True)
result={'base':B,'source':S,'evidence':E,'tree':g('rev-parse',S+'^{tree}').decode().strip(),'sourceFiles':rows,'exactCopiedFiles':6,'actualSourceFiles':7,'actualSourceBytes':sum(x['bytes'] for x in rows),'unchangedMainIdentities':2199,'publicReceiptVerified':True,'privateInventoryOnlyCount':4,'privateInventoryOnlyBytes':7801,'native':'NOT_RUN','fullBuild':'NOT_RUN','protected':'NOT_RUN','PR':'NOT_CREATED','scopedFindings':{'P0':0,'P1':0,'P2':0},'next':'normal draft PR for exact code-only source388fd4; genuine hosted lifecycle/requiredchecks pending'}
(O/'release-check.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='sourceFiles'}))

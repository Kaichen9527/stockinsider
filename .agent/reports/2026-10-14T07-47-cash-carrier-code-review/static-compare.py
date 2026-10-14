import json,subprocess,hashlib,pathlib
root=pathlib.Path('/tmp/si-pubtail-o14');old='e2dcb6c20b71561dfb37d7728809b0be257d8fe2';head='06ae6924a7d6a90d60d3161a154fdb5104aab3f1';base='b7796da8a92b99284b133a7a622e490a23bad11b'
def get(ref,path):return subprocess.check_output(['git','show',f'{ref}:{path}'],cwd=root)
def pins(ref):
 s=get(ref,'web/src/lib/research-historical-cash-pins.ts').decode();return json.loads(s.split('export const historicalCashPins = freeze(',1)[1].split(' as const);')[0])
a,b=pins(old),pins(head);assert b['limits'].pop('carrier')==1048576
for k in ('2409','2383'):b['companies'][k].pop('carrier')
assert a==b
unchanged=[]
for path in ['web/src/lib/research-historical-cash-core.ts','scripts/fixtures/research-historical-cash/operands-and-decimal-vectors.json','scripts/fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz','.github/workflows/research-historical-cash-quality.yml','.github/workflows/source-led-opportunity-v3.yml','package.json','package-lock.json','web/package.json','web/package-lock.json']:
 x,y=get(old,path),get(head,path);assert x==y;unchanged.append({'path':path,'bytes':len(x),'sha256':hashlib.sha256(x).hexdigest()})
paths=subprocess.check_output(['git','diff','--name-only',base,head],cwd=root,text=True).splitlines();assert len(paths)==7
sources=[]
for path in paths:
 b=get(head,path);sources.append({'path':path,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'blob':subprocess.check_output(['git','rev-parse',f'{head}:{path}'],cwd=root,text=True).strip()})
print(json.dumps({'subject':head,'base':base,'oldSubject':old,'originalPinsUnchangedAfterRemovingOnlyCarrierAdditions':True,'unchanged':unchanged,'fullStackSources':sources},indent=2))

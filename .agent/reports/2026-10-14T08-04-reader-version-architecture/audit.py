import subprocess,json,hashlib,pathlib,datetime
root='/tmp/si-pubtail-o14';s='15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb';c='06ae6924a7d6a90d60d3161a154fdb5104aab3f1'
def raw(ref,p):return subprocess.check_output(['git','show',ref+':'+p],cwd=root)
def sha(b):return hashlib.sha256(b).hexdigest()
m=json.loads(raw(s,'web/src/lib/research-complete-mapping.json'))
closure=[]
for pin in m['sourceClosure']:
 b=raw(s,pin['file']);closure.append({**pin,'actualBytes':len(b),'actualSHA':sha(b),'matches':len(b)==pin['bytes'] and sha(b)==pin['sha256']})
computed=sha(json.dumps(m['sourceClosure'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())
inventory=[]
for sym,v in m['companies'].items():
 for pin in v['inventory']:
  b=raw(s,pin['file']);inventory.append({'symbol':sym,**pin,'actualBytes':len(b),'actualSHA':sha(b),'matches':len(b)==pin['bytes'] and sha(b)==pin['sha256']})
paths=['web/src/lib/research-financial-file-reader.ts','web/src/lib/research-financial-supplement.ts','web/src/lib/research-complete-input.ts','web/src/lib/research-complete-mapping.json','web/src/lib/research-complete-canonical.ts','web/src/lib/research-financial-inventory.ts','web/src/app/api/internal/research-deep-job/route.ts','scripts/research-complete-input.test.mjs','scripts/research-financial-cleanup.test.mjs','scripts/research-financial-supplement.test.mjs','migrations/20261009_research_complete_input_v2.sql','migrations/20261011_research_complete_mapping_precision_v2.sql','migrations/20261009_research_input_preparation_assert_v2.sql','migrations/20261009_research_author_assignments_v2.sql','migrations/20261009_research_author_packet_v2.sql','migrations/20261009_research_author_results_v2.sql','web/src/lib/research-author-packet.ts','web/src/lib/research-author-result.ts','web/src/lib/research-author-handoff.ts','web/src/lib/research-reviewer-assignment.ts','web/src/lib/research-reviewer-result.ts']
source=[]
for p in paths:
 b=raw(s,p);source.append({'subject':s,'path':p,'bytes':len(b),'sha256':sha(b),'blob':subprocess.check_output(['git','rev-parse',s+':'+p],cwd=root,text=True).strip()})
for p in ['web/src/lib/research-historical-cash-pins.ts','web/src/lib/research-historical-cash-projection.ts','docs/operations/2026-10-14/historical-cash-projection-handoff.md']:
 b=raw(c,p);source.append({'subject':c,'path':p,'bytes':len(b),'sha256':sha(b)})
exists={}
for ref in ['b7796da8a92b99284b133a7a622e490a23bad11b','69b9734c5766b2e196e8133d63df1f1148959046']:
 names=set(subprocess.check_output(['git','ls-tree','-r','--name-only',ref],cwd=root,text=True).splitlines());exists[ref]={p:p in names for p in paths[:4]}
print(json.dumps({'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':s,'cashSource':c,'closureHashExpected':m['sourceClosureHash'],'closureHashComputed':computed,'closureCount':len(closure),'closure':closure,'inventory':inventory,'modulePresence':exists,'readSources':source},indent=2))

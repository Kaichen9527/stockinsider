exec(open('/tmp/versioned-protocol-o14/enumerate.py').read().split('seeds=')[0])
rows=json.loads((O/'source-enumeration.json').read_text());seen={(x['subject'],x['file'])for x in rows};m=json.loads(read(L,'web/src/lib/research-complete-mapping.json'));legacy=[]
for x in m['sourceClosure']:
 b=read(L,x['file']);assert len(b)==x['bytes']and hashlib.sha256(b).hexdigest()==x['sha256'];legacy.append(x)
 if(L,x['file'])not in seen:rows.append(ident(L,x['file']));seen.add((L,x['file']))
assert hashlib.sha256(json.dumps(legacy,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()==m['sourceClosureHash']
(O/'historical77b1-proof.json').write_text(json.dumps({'source':L,'sourceClosureHash':m['sourceClosureHash'],'files':legacy,'allByteHashesVerified':True},indent=2))
for name in ['codec.js','official-market-authority-v314.js','official-calendar-v314.js','official-mops-v314.js','official-twse-valuation.js']:
 p='scripts/runtime/'+name;rows.append(ident(N,p))
(O/'source-enumeration.json').write_text(json.dumps(rows,indent=2)+'\n')
descriptor=json.loads(read(T,'scripts/opportunity-v3/research-publication-tail-descriptor.json'));(O/'tail-descriptor-original.json').write_text(json.dumps(descriptor,indent=2)+'\n');print('descriptor keys',descriptor.keys())
paths=re.findall(r'migrations/[^\"\s]+\.sql',json.dumps(descriptor));sqls=json.loads((O/'sql-source-enumeration.json').read_text());oldseen={(x['subject'],x['file'])for x in sqls}
for p in sorted(set(paths)):
 if(T,p)not in oldseen:
  x=ident(T,p);x['equalLegacy15d4']=p in trees[L]and read(T,p)==read(L,p);sqls.append(x)
(O/'sql-source-enumeration.json').write_text(json.dumps(sqls,indent=2)+'\n')
(O/'absence-matrix.json').write_text(json.dumps([{'file':x['file'],'sourceSubject':x['subject'],'present':x['present']}for x in rows],indent=2)+'\n')
# Keep actual Root decision, not guessed versioned-contract/ path.
rootpaths=['.agent/reports/2026-10-14T18-25-versioned-contract-and-pr380/contract/root-engineering-decision-and-next-session-boundary.md','.agent/reports/2026-10-14T18-25-versioned-contract-and-pr380/contract/root-verification.json']
for p in rootpaths:(O/Path(p).name).write_bytes(git('show','ff3ae088:'+p))
# Every published cash citation numeric path: inventory only, NOT an allowlist activation.
paths=[]
for symbol in ['2409','2383']:
 p=f'.agent/reports/2026-10-14T10-56-v3-finite-material-session/{symbol}-actualfs-normalized.json';v=json.loads(git('show','ce64c0c5:'+p))['financialMaterial']['projection']['historicalCash']
 def walk(x,trail=''):
  if isinstance(x,bool):return
  if isinstance(x,(int,float)):paths.append({'symbol':symbol,'path':'/historicalCash'+trail,'value':x})
  elif isinstance(x,dict):
   for k,v in x.items():walk(v,trail+'/'+k)
  elif isinstance(x,list):
   for i,v in enumerate(x):walk(v,trail+'/'+str(i))
 walk(v)
(O/'cash-numeric-path-inventory-NOT-approved-allowlist.json').write_text(json.dumps(paths,indent=2)+'\n')
print(json.dumps({'allSourceRows':len(rows),'historicalClosure':len(legacy),'tailPaths':len(set(paths))if False else len(set(re.findall(r'migrations/[^\"\s]+\.sql',json.dumps(descriptor)))),'sqlRows':len(sqls),'cashNumericPaths':len(paths)}))

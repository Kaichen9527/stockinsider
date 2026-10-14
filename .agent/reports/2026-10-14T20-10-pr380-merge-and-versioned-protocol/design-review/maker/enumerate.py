from pathlib import Path
import subprocess,json,hashlib,re,posixpath
R=Path('/tmp/si-pubtail-o14');O=Path('/tmp/versioned-protocol-o14');L='15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb';N='72f639801d4000f375bea879de5139f6b1232580';M='1f152fdf43add6bc7f97a00d7e36a7e8cfc105d4';T='dd59817f750684b093965f539dd4de466be13077'
def git(*a):return subprocess.check_output(['git',*a],cwd=R)
trees={s:set(git('ls-tree','-r','--name-only',s).decode().splitlines())for s in[L,N,M,T]};cache={}
def read(s,p):
 if(s,p)not in cache:cache[s,p]=git('show',s+':'+p)
 return cache[s,p]
def ident(s,p):
 b=read(s,p);return{'subject':s,'file':p,'blob':git('rev-parse',s+':'+p).decode().strip(),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'present':{k:p in trees[v]for k,v in [('legacy15d4',L),('candidate72f',N),('main1f',M),('taildd598',T)]}}
seeds=['web/src/app/api/internal/research-deep-job/route.ts']+['web/src/lib/'+p+'.ts'for p in ['research-complete-input','research-author-assignment','research-author-packet','research-author-result','research-author-handoff','research-reviewer-assignment','research-reviewer-result','research-atomic-publication','research-business-article','research-financial-supplement','research-deep-author-input','research-deep-claim-context','research-v3-finite-material','research-cash-financial-reader','research-compatible-financial-reader']]
queue=list(seeds);visited=set();edges=[];unknown=[];external=[];rows=[]
while queue:
 p=queue.pop(0)
 if p in visited:continue
 visited.add(p);s=N if p in trees[N]else L
 if p not in trees[s]:unknown.append({'file':p,'reason':'no actual source'});continue
 rows.append(ident(s,p));text=read(s,p).decode();
 if not p.endswith(('.ts','.tsx','.js','.mjs','.cjs')):continue
 for match in re.finditer(r'(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)[\'\"]([^\'\"]+)[\'\"]',text):
  spec=match[1];line=text.count('\n',0,match.start())+1;dynamic='('in match[0]
  if spec.startswith('.')or spec.startswith('@/'):
   q=posixpath.normpath(posixpath.join(posixpath.dirname(p),spec))if spec.startswith('.')else 'web/src/'+spec[2:];q=q.split('?')[0]
   candidates=[q]+[q+x for x in ['.ts','.tsx','.js','.mjs','.json','/index.ts','/index.js']];target=next((c for c in candidates if c in trees[N]or c in trees[L]),None)
   edges.append({'from':p,'subject':s,'line':line,'specifier':spec,'literalDynamic':dynamic,'resolved':target})
   if target:queue.append(target)
   else:unknown.append({'file':p,'line':line,'specifier':spec,'reason':'unresolved literal path'})
  else:external.append({'from':p,'line':line,'specifier':spec,'kind':'builtin'if spec.startswith('node:')else 'locked package/runtime'})
 for m in re.finditer(r'\b(?:import|require)\s*\(\s*(?![\'\"\s])',text):unknown.append({'file':p,'line':text.count('\n',0,m.start())+1,'reason':'nonliteral dynamic syntax needs manual review','snippet':text[m.start():m.start()+120]})
for p in ['.nvmrc','package.json','package-lock.json','web/package.json','web/package-lock.json','web/tsconfig.json','web/next.config.ts','web/next.config.mjs','web/scripts/sync-official-authority.mjs']:
 if p in trees[N]and p not in visited:rows.append(ident(N,p))
# Fixed original source closure and mappings are dependencies even when an AST import omits generated inputs.
mapping=json.loads(read(L,'web/src/lib/research-complete-mapping.json'));(O/'legacy-mapping-keys.json').write_text(json.dumps({k:type(v).__name__ for k,v in mapping.items()},indent=2))
# All original publication functions/tables/guards: not a deployment instruction.
sqlpaths=sorted(p for p in trees[L]if p.startswith('migrations/')and any(k in p for k in ['research_input_preparation','research_complete_input','research_author_','research_reviewer_','research_atomic_publication','research_publication_','research_observed','research_deep_jobs','research_agent_model','research_admission_isolation','research_cloud_execution']))
sqlrows=[];signatures=[];hits=[]
for p in sqlpaths:
 sqlrows.append(ident(L,p));txt=read(L,p).decode();lines=txt.splitlines()
 for i,line in enumerate(lines,1):
  if re.search(r'^CREATE (?:OR REPLACE )?FUNCTION',line):signatures.append({'file':p,'line':i,'declaration':line[:1200]})
  if re.search(r'research_input_v2|research-article-input-v2|UNION ALL|524288|262144|160000|120 seconds|610091002|2409,6002|canonical_request|unique|UNIQUE',line):hits.append({'file':p,'line':i,'text':line if len(line)<1800 else line[:700]+' [long exact mapping omitted; full-file SHA recorded]'})
 (O/'legacy'/p).parent.mkdir(parents=True,exist_ok=True);(O/'legacy'/p).write_bytes(read(L,p))
for p in seeds+['web/src/lib/research-complete-canonical.ts','web/src/lib/research-financial-file-reader.ts','web/src/lib/research-financial-inventory.ts','web/src/lib/research-financial-clock.ts','web/src/lib/research-complete-schema-bundles.ts']:
 if p in trees[L]:
  target=O/'legacy'/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(read(L,p))
functions=[];rpccalls=[]
for r in rows:
 p=r['file'];txt=read(r['subject'],p).decode()
 for i,line in enumerate(txt.splitlines(),1):
  if re.search(r'(?:export )?(?:async )?function ',line):functions.append({'file':p,'line':i,'declaration':line[:500]})
  if re.search(r'\.rpc\(|runCompleteInput|validateCompleteResponse|parseCompleteRequest|readFile|readFileSync|import\(|require\(',line):rpccalls.append({'file':p,'line':i,'text':line[:700]})
for name,v in [('source-enumeration',rows),('static-import-edges',edges),('external-dependencies',external),('unresolved-dynamic-edges',unknown),('sql-source-enumeration',sqlrows),('sql-signatures',signatures),('sql-boundary-excerpts',hits),('actual-functions',functions),('actual-call-boundaries',rpccalls)]: (O/(name+'.json')).write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'sourceFiles':len(rows),'importEdges':len(edges),'externalEdges':len(external),'unknownEdges':len(unknown),'sqlFiles':len(sqlrows),'sqlSignatures':len(signatures)}))

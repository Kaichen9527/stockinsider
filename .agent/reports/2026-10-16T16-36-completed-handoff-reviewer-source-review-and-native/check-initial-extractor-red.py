import subprocess,json,hashlib,re,pathlib,os,datetime
G='/tmp/stockinsider-discovery-release-root-review-oct14'; S='222d922b7616d5ab55b7e3261982983841d9f9f9'; E='8b00416572b97e44832a792384dc60ad47d3e991'; B='87b197eddf452d6144f906b54b184f1af9f4adc9'; R='.agent/reports/2026-10-16T01-13-completed-handoff-reviewer-source/'
def git(*a):return subprocess.check_output(['git',*a],cwd=G)
def get(ref,p):return git('show',ref+':'+p)
def obj(ref,p):return json.loads(get(ref,p))
def sha(b):return hashlib.sha256(b).hexdigest()
receipt=obj(E,R+'receipt.json'); rb=get(E,R+'receipt.json'); assert sha(rb)=='f7303c7cd8a302d38d68346b68f7d5dbe3b6ae8d7b8782062af85ba7e6d8a4a0'
assert receipt['source']==S and receipt['base']==B and git('rev-parse',S+'^{tree}').decode().strip()==receipt['tree']
seal=obj(E,R+'source-seal.json'); files=seal['files']; assert len(files)==receipt['sourceInputCount']==314 and len({f['path'] for f in files})==314
# Git batch: bounded ~10MB, no full source extraction or runtime imports.
q=b''.join((S+':'+f['path']+'\n').encode() for f in files); proc=subprocess.run(['git','cat-file','--batch'],input=q,stdout=subprocess.PIPE,cwd=G,check=True); data=proc.stdout; at=0; total=0
for f in files:
 end=data.index(b'\n',at); header=data[at:end].decode().split(); n=int(header[2]); at=end+1; b=data[at:at+n]; at+=n+1
 assert header[0]==f['blob'] and header[1]=='blob' and n==f['bytes'] and sha(b)==f['sha256'],f['path'];total+=n
assert at==len(data) and total==receipt['sourceInputBytes']==10280563
pub=receipt['publishedFiles']; assert len(pub)==11 and sum(f['bytes'] for f in pub)==receipt['publishedBytesExcludingReceipt']==214893
for f in pub:
 b=get(E,R+f['path']); assert len(b)==f['bytes'] and sha(b)==f['sha256'],f['path']
old=obj(B,'.agent/reports/2026-10-16T08-48-v3-handoff-binding-fence-source/source-seal.json')['files']; new={f['path']:f for f in files}; allowed=set(seal['changedInheritedPaths']); assert len(old)==310 and len(allowed)==7
for f in old:
 if f['path'] not in allowed:assert new[f['path']]['blob']==f['blob'] and new[f['path']]['sha256']==f['sha256'],f['path']
assert sum(f['path'] not in allowed for f in old)==303
raw=obj(E,R+'raw-inventory.json'); assert raw['count']==len(raw['files'])==receipt['rawCount']==90 and sum(f['bytes'] for f in raw['files'])==raw['bytes']==receipt['rawBytes']==1095138
for f in raw['files']:assert re.fullmatch('[0-9a-f]{64}',f['sha256'])
# Independently extract BOTH base and final byte fragments, rather than trust new pins.
prefix='web/src/lib/'
def text(ref,n):return get(ref,prefix+n).decode()
def block(s,a,b):return s[s.index(a):s.index(b,s.index(a))]
oldv=text(B,'research-versioned-complete-input.ts'); newv=text(S,'research-versioned-complete-input.ts')
checks={}
checks['fullResponseValidator']=block(oldv,' const select=',' return Object.freeze({')==block(newv,' const select=',' return validate;')
checks['activeController']=oldv[oldv.index('  async runCompleteInput('):]==newv[newv.index('  async runCompleteInput('):]
oldc=text(B,'research-v3-article-citations.ts'); newc=text(S,'research-v3-article-citations.ts')
checks['fullCitationArithmeticBody']=block(oldc,'      ensure(response.status','  return Object.freeze({')==block(newc,'      ensure(response.status','  return Object.freeze({\n    /** Pure')
olda=text(B,'research-v3-business-article.ts'); newa=text(S,'research-v3-business-article.ts')
checks['articleCore']=block(olda,'function validateArticle(', '/** Trusted server factory.')==block(newa,'function validateArticle(', '/** Trusted server factory.')
checks['activeArticle']=olda[olda.index('async validate(db:'):]==newa[newa.index('async validate(db:'):]
checks['authorFullFileExportOnly']=text(B,'research-v3-author-result.ts')==text(S,'research-v3-author-result.ts').replace('export function projectResearchAuthorPacket(','function projectResearchAuthorPacket(')
assert all(checks.values()),checks
pins=obj(S,'docs/operations/2026-10-16/v3-completed-handoff-reviewer/original-seam-pins.json')
for f in pins['files']:
 b=get(B,f['path']);assert len(b)==f['bytes'] and sha(b)==f['sha256'] and git('rev-parse',B+':'+f['path']).decode().strip()==f['blob']
frags={'responseValidator':block(oldv,' const select=',' return Object.freeze({'),'activeController':oldv[oldv.index('  async runCompleteInput('):],'citationCore':block(oldc,'      ensure(response.status','  return Object.freeze({'),'articleCore':block(olda,'function validateArticle(', '/** Trusted server factory.'),'activeArticle':olda[olda.index('async validate(db:'):],'authorResultOriginal':text(B,'research-v3-author-result.ts')}
for k,v in frags.items():assert sha(v.encode())==pins['pins'][k],k
for leaf,count in [('contracts.tap',26),('citation-regression.tap',20),('source-parity.tap',7)]:
 t=get(E,R+leaf).decode();assert re.search(r'^# pass '+str(count)+r'$',t,re.M) and re.search(r'^# fail 0$',t,re.M)
 for label in ['cancelled','skipped','todo']:assert re.search(r'^# '+label+r' 0$',t,re.M)
resources=obj(E,R+'resources.json');assert resources['floorBytes']==8589934592 and all(n>=8589934592 for n in resources['minFreeBytes'].values()) and resources['sampledPeakProcessTreeRssBytes']<8589934592
metrics=obj(E,R+'packet-metrics.json');assert len(metrics['metrics'])==2
for m in metrics['metrics']:assert m['envelopeBytes']<=1048576 and m['articleBytes']<=262144 and m['sections']==7 and m['modelCalls']==m['completedActiveInputReads']==0
# Small inspectable local evidence only, never private source/raw or large snapshots.
out=pathlib.Path('/tmp/stockinsider-completed-handoff-reviewer-root-review-oct16')
for f in pub:(out/f['path']).write_bytes(get(E,R+f['path']))
(out/'receipt.json').write_bytes(rb)
result={'observedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':S,'evidence':E,'receiptSha256':sha(rb),'actualGitInputsVerified':len(files),'actualGitInputBytes':total,'publishedIncludingReceiptCount':len(pub)+1,'publishedIncludingReceiptBytes':214893+len(rb),'unchangedInherited':303,'allowedChangedInherited':sorted(allowed),'independentBaseFinalByteParity':checks,'privateRawScope':'inventory count/sum/hash-format only; contents NOT obtained','privateRawCount':90,'privateRawBytes':1095138,'makerChecksOnly':receipt['checks'],'makerResources':{k:resources[k] for k in ['sampledPeakProcessTreeRssBytes','minFreeBytes','sampledNotInstantaneousPeak']},'rootAvailableBytes':os.statvfs('/tmp').f_bavail*os.statvfs('/tmp').f_frsize,'rootRuntimeNativeBuildExecuted':False,'nativeSqlApplied':False,'formalApproval':False,'fullGoalComplete':False}
(out/'root-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))

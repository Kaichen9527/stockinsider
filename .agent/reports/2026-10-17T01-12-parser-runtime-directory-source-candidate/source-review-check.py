import pathlib,subprocess,json,hashlib,datetime,re
repo='/tmp/stockinsider-discovery-release-root-review-oct14';base='93e44475cbb0c27beb26e4dcb68e382096a4e212';source='b301feedb1d5a06721c41e57acefcc26515f6c6c';evidence='1f5f3fcacbf16c988e3717b233711c91da0284a0';unit='deployment/vps/systemd/stockinsider-web-standalone.service';prefix='docs/operations/2026-10-17/parser-runtime-directory-preserve/'
out=pathlib.Path('/tmp/stockinsider-parser-lifecycle-source-oct17-1705');sha=lambda b:hashlib.sha256(b).hexdigest();git=lambda *a:subprocess.check_output(['git',*a],cwd=repo);blob=lambda r,p:git('show',r+':'+p)
assert git('rev-parse',source+'^').decode().strip()==base
assert git('rev-parse',evidence+'^').decode().strip()==source
old=blob(base,unit);new=blob(source,unit);assert new==blob(evidence,unit)
assert len(old)==1312 and sha(old)=='fa55cd9efbe061e500b405fb5bfc9ea0a89e0d1ad1a915e2b135d25a0d3380cb'
assert len(new)==1341 and sha(new)=='7a948b2732c02595fe5100bb10206e99c58401c4f8921a7230fa66da373397a5'
added=b'RuntimeDirectoryPreserve=yes\n';anchor=b'RuntimeDirectory=stockinsider\nRuntimeDirectoryMode=0750\n';assert old.count(anchor)==1 and new.count(added)==1 and new.replace(added,b'')==old and old.replace(anchor,anchor+added)==new
assert git('diff','--name-only',base,source).decode().splitlines()==[unit,prefix+'HANDOFF.md']
assert set(git('diff','--name-only',base,evidence).decode().splitlines())=={unit,*[prefix+x for x in ['HANDOFF.md','CHECKS.json','RAW-INVENTORY.json','RECEIPT.json']]}
def tree(ref):
 rows={}
 for s in git('ls-tree','-rz',ref).split(b'\0'):
  if not s:continue
  meta,path=s.split(b'\t',1);rows[path.decode()]=meta.decode()
 return rows
t0=tree(base);t1=tree(evidence);unchanged=0
for path,meta in t0.items():
 if path==unit:continue
 assert t1[path]==meta;unchanged+=1
assert set(t1)-set(t0)=={prefix+x for x in ['HANDOFF.md','CHECKS.json','RAW-INVENTORY.json','RECEIPT.json']}
receiptBytes=blob(evidence,prefix+'RECEIPT.json');assert sha(receiptBytes)=='bfc7f7c3409ee1579ff48d73058783c781503632b9395c3d894bcf2db7025146';receipt=json.loads(receiptBytes)
public=[]
for row in receipt['filesExcludingReceipt']:
 b=blob(evidence,prefix+row['path']);assert len(b)==row['bytes'] and sha(b)==row['sha256'];public.append({'path':prefix+row['path'],'bytes':len(b),'sha256':sha(b)});(out/('maker-'+row['path'])).write_bytes(b)
public.append({'path':prefix+'RECEIPT.json','bytes':len(receiptBytes),'sha256':sha(receiptBytes)});(out/'maker-RECEIPT.json').write_bytes(receiptBytes)
checks=json.loads(blob(evidence,prefix+'CHECKS.json'));inventory=json.loads(blob(evidence,prefix+'RAW-INVENTORY.json'))
assert len(inventory['files'])==inventory['count']==12 and sum(x['bytes'] for x in inventory['files'])==inventory['bytes']==7845
assert all(re.fullmatch('[0-9a-f]{64}',x['sha256']) for x in inventory['files'])
assert checks['offlineTool']['verify']==checks['offlineTool']['lifecycle']=='NOT_RUN' and checks['nativeTestsRun']==0
actual=[{'ref':base,'path':unit,'bytes':len(old),'sha256':sha(old)},{'ref':source,'path':unit,'bytes':len(new),'sha256':sha(new)}]
for pin in checks['unchangedParserPins']:
 b=blob(base,pin['path']);assert len(b)==pin['bytes'] and sha(b)==pin['sha256'] and b==blob(evidence,pin['path']);actual.append({'ref':base,'path':pin['path'],'bytes':len(b),'sha256':sha(b)})
assert len(actual)==5 and sum(x['bytes'] for x in actual)==9187
subprocess.run(['git','diff','--check',base,evidence],cwd=repo,check=True)
review={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':source,'evidence':evidence,'base':base,'rootActualGitSourceInputs':actual,'rootActualGitSourceCount':5,'rootActualGitSourceBytes':9187,'publishedReceiptFilesVerified':public,'publishedReceiptFileCount':4,'publishedReceiptBytes':sum(x['bytes'] for x in public),'privateRawInventoryOnly':{'count':12,'bytes':7845,'contentsObtained':False},'exactReverseByteParity':True,'allOtherBaseGitTreeEntriesIdentical':unchanged,'baseGitTreeEntries':len(t0),'extraDocumentationPaths':4,'scope':'unactivated one-line source integration review; not systemd/native/production/formal publication approval','sourceIntegrationFindings':{'P0':0,'P1':0,'P2':0},'systemdVerify':'NOT_RUN','systemdLifecycle':'NOT_RUN','fullApplicationBuild':'NOT_RUN','productionUnitModified':False,'currentMissingSocketRestored':False,'canonicalProfileUnchangedByGitTree':True,'normalProtectedChecksPending':True,'fullGoalStillIncomplete':True}
(out/'source-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n');print(json.dumps(review,ensure_ascii=False))

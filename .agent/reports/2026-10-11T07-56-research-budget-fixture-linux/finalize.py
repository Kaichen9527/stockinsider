import pathlib,json,hashlib,subprocess,datetime,os,re,shutil
root=pathlib.Path('/tmp/si-d6-lpzhalmy');work=pathlib.Path('/workspace/cloud-reviewer-result-http-vm-oct09');prefix='2026-10-11T07-56-research-budget-fixture-linux'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(n,v):(root/n).write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
def git(*args):return subprocess.check_output(['git',*args],cwd=work,text=True).strip()
pre=json.loads((root/'preflight.json').read_text());stages=[json.loads((root/(n+'.json')).read_text())for n in ['research-agents-serial','typecheck','lint','normal-build']]
assert git('rev-parse','HEAD')==pre['head'];assert git('status','--porcelain')==''
assert all(x['guardTermination'] is None for x in stages)
source=json.loads((root/'source-manifest.json').read_text())
for x in source:
 p=work/x['path'];assert p.stat().st_size==x['bytes'] and sha(p)==x['sha256'],x['path']
out=(root/'research-agents-serial.stdout').read_text();counts={k:int(re.findall(r'^# '+k+r' (\d+)$',out,re.M)[-1])for k in ['tests','pass','fail','skipped','cancelled','todo']};skips=[l for l in out.splitlines() if '# SKIP' in l];save('test-inventory.json',{'counts':counts,'skipLines':skips,'allSubtestNames':re.findall(r'^\s*# Subtest: (.*)$',out,re.M),'topLevelPlan':re.findall(r'^1\.\.\d+$',out,re.M),'notAllProfilesEnabled':True})
nextdir=work/'web/.next';files=[]
if stages[-1]['exitCode']==0:
 for p in sorted((nextdir/'server').rglob('*')):
  if p.is_file():files.append({'path':str(p.relative_to(nextdir)),'bytes':p.stat().st_size,'sha256':sha(p)})
 save('compiled-server-manifest.json',files)
 build={'source':pre['head'],'tree':pre['tree'],'webTree':pre['webTree'],'buildId':(nextdir/'BUILD_ID').read_text().strip(),'node':pre['node'],'nextVersion':json.loads((work/'web/node_modules/next/package.json').read_text())['version'],'compiler':'normal npm build / Turbopack','prebuildVerified':'Official authority build bridge verified (5 canonical modules).' in (root/'normal-build.stdout').read_text(),'serverManifestSha256':sha(root/'compiled-server-manifest.json'),'serverFileCount':len(files),'serverLogicalBytes':sum(x['bytes']for x in files),'previousE088':{'buildId':'Bv6FW39iE9II6pvbC4qtm','serverFileCount':2088,'serverManifestSha256':'e01c8ade6ccd5f075abb5582d2a29ac42b55036d1e6f8f16da2161028b79ad45','sameWebTree':True,'newBuildExecuted':True,'notReusedBuild':True}}
 save('build-identity.json',build)
else:build={'exitCode':stages[-1]['exitCode'],'buildNotPassed':True}
live=[]
for p in pathlib.Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:
  comm=(p/'comm').read_text().strip();s=(p/'stat').read_text().rsplit(')',1)[1].split()
  if comm in ['postgres','postmaster','node','npm','chrome','chromium'] and s[0]!='Z':live.append({'pid':int(p.name),'comm':comm,'ppid':int(s[1]),'state':s[0]})
 except (OSError,ValueError,IndexError):pass
clusters=[]
for parent in [root,pathlib.Path('/tmp')]:
 for p in parent.iterdir():
  if p.is_dir() and ('stockinsider' in p.name or p.name.startswith(('si-','research-'))):
   if (p/'postmaster.pid').exists():clusters.append(str(p/'postmaster.pid'))
cleanup={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'allStagesRemainingObservedChildren':[x['remainingObservedChildren']for x in stages],'liveRelevantProcesses':live,'topLevelTestClusterPidFiles':clusters,'diskAvailableBytes':os.statvfs(work).f_bavail*os.statvfs(work).f_frsize,'rebuildableCacheAndSyntheticJournalScratchRetainedPrivate':True,'uniqueEvidenceDeleted':False,'noGlobalPrune':True}
save('cleanup.json',cleanup)
assert not live,'live services require investigation'
reportdir=work/'.agent/reports'/prefix;reportdir.mkdir(parents=True,exist_ok=False)
raw=[]
for p in sorted(root.iterdir()):
 if not p.is_file():continue
 dest=reportdir/p.name;shutil.copyfile(p,dest);raw.append({'path':str(dest.relative_to(work)),'bytes':dest.stat().st_size,'sha256':sha(dest)})
r={'schemaVersion':'research-budget-fixture-linux-evidence-v1','sourceIdentity':pre,'scope':{'evidenceOnly':True,'fixedSourceUnmodified':True,'onlySourceDelta':'source-budget test fixture adds original thesis-isolation migration','manualEngineeringNotModelBudget':True,'budgetMinutes':20,'hardStopAt':pre['manualHardStopAt'],'noBrowserPCRCI03OrNewLibrary':True,'noProductionOrModelsOrStrategyApproval':True,'protectedApproval':False},'independentReviewAttribution':{'providedByRoot':True,'codeReceiptSha256':'0bc2c00c376ecd5caba40ede1c4de659938b798ca5a38cbda2614f20c837f6ae','notVMIndependentReview':True},'testResult':{'counts':counts,'skips':skips,'originalPackageSelectionFiles':78,'originalScriptEquivalentInvocation':'bash saved literal package script, only --test-concurrency=1 inserted; no lifecycle hooks present','noAssertFileGlobOrTestNameChanges':True},'stages':stages,'build':build,'sourceManifestFiles':len(source),'sourceManifestSha256':sha(root/'source-manifest.json'),'sourceComparisonSha256':sha(root/'source-identity-comparison.json'),'priorE088Red':{'evidenceHead':'3777e6b6a571c8755952c6f21a81b7abf4369f39','receiptSha256':'71945a2f78754086a4f0e0964cc91b1092dedbbf8d74eebcd4796ce4b77383c5','counts':{'tests':818,'pass':815,'fail':1,'skipped':2},'preservedNotRelabeled':True,'failure':'source-budget fixture missing thesis-isolation successor produced wrong policy body hash'},'resources':{'sampledAggregatePeakRssBytes':max(x['sampledAggregatePeakRssBytes']for x in stages),'minimumObservedStageBoundaryDiskBytes':min(min(x['diskAvailableBeforeBytes'],x['diskAvailableAfterBytes'])for x in stages),'rssSamplingCaveat':stages[0]['rssMethod'],'diskGuardSampleIntervalMilliseconds':100,'reserveBytes':8*1024**3,'rssGuardBytes':8*1024**3},'cleanup':cleanup,'limits':['Two explicit isolated native profiles skipped by original package command; not counted as pass.','No CI03 because exact reviewed clock library absent; no retry/install/shim.','No Chromium/full Linux PCR; official CDN403 remains separate capability limitation.','Isolated synthetic engineering fixtures do not establish actual author/reviewer/model/publication/strategy or protected authority.'],'rawFiles':raw,'rawFileCount':len(raw),'rawTotalBytes':sum(x['bytes']for x in raw),'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
receipt=work/'.agent/reports'/(prefix+'.json');receipt.write_text(json.dumps(r,indent=2,ensure_ascii=False)+'\n');print(json.dumps({'receipt':str(receipt),'bytes':receipt.stat().st_size,'sha256':sha(receipt),'counts':counts,'build':build,'rawFiles':len(raw),'rawBytes':sum(x['bytes']for x in raw),'resources':r['resources']},indent=2))

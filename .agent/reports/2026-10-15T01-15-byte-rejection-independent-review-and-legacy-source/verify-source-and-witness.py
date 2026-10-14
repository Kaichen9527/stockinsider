from pathlib import Path
import json,subprocess,hashlib,re
p=Path('/tmp/stockinsider-byte-rejection-execution-root-review-oct15');root=Path('/tmp/stockinsider-discovery-release-root-review-oct14');r=json.loads((p/'receipt.json').read_text())
for n in ['source-seal.json','corrected-source-seal.json']:
 seal=json.loads((p/n).read_text());assert len(seal['files'])==249
 for row in seal['files']:
  b=subprocess.check_output(['git','cat-file','blob',seal['head']+':'+row['path']],cwd=root);assert len(b)==row['bytes'] and hashlib.sha256(b).hexdigest()==row['sha256']
  assert subprocess.check_output(['git','rev-parse',seal['head']+':'+row['path']],cwd=root,text=True).strip()==row['blob']
changed=subprocess.check_output(['git','diff','--name-only',r['base'],r['executedCorrectedCode']],cwd=root,text=True).splitlines();assert changed==['scripts/opportunity-v3/research-versioned-byte-rejection-native.test.mjs']
w=json.loads((p/'public-safe-witness.json').read_text());assert w['corrected']=={'pass':3,'fail':0,'children':2,'parents':1,'cancelled':0,'skipped':0,'todo':0};assert not w['independentlyApproved'] and not w['privateRawPublic'] and not w['formalApproval']
cases=[]
for case in w['cases']:
 assert case['expectedError']=={'code':'P0001','message':'complete_byte_bound'}
 assert case['status']=='PASS' and case['allCapsFalse'] and case['firstClocksAndHashesUnchanged'] and case['fullLedgerUnchanged']
 stages=case['stages'];assert len(stages)==5
 assert [s['charge']['count'] for s in stages]==[1,2,2,3,3]
 before,after=stages[-2:];assert before['audit']==after['audit'] and before['ledgerHash']==after['ledgerHash'] and before['charge']==after['charge']
 for s in stages:
  assert len(s['audit'])==9
  assert all(isinstance(x['count'],int) and x['count']>=0 and re.fullmatch('[0-9a-f]{64}',x['hash']) for x in s['audit'].values())
  assert s['charge']['bytes']<=524288
 m=case['chargeMeasurement'];assert m['initialPreparation']+m['firstSeal']+m['secondPreparation']==before['charge']['bytes']
 assert case['actualRejectedWouldCharge'] is None and case['actualRejectedTotal'] is None and case['predictionIsMeasurement'] is False
 for x in case['lifecycle']:assert x['preNoNewOpensFromSnapshot'] and x['postFdsRetained'] and x['sealAllFdsClosed']
 assert after['fd']['opens']==after['fd']['closes']
 cleanup=case['cleanup'];assert cleanup['clusterAbsent'] and cleanup['writerAbsent'] and cleanup['observerAbsent'] and cleanup['readOnlyObserver'] and cleanup['serverShutdownConfirmed'] and cleanup['preCleanupLogRetained']
 assert not case['sourceLocator']['independentNewsRootQualification'] and not case['sourceLocator']['publicationCompatibilityProven']
 cases.append({'case':case['case'],'error':case['expectedError'],'fiveStageNineTableWitnessConsistent':True,'ledgerBeforeAfterHash':before['ledgerHash'],'usedBeforeAndAfterRejection':before['charge'],'originalWouldChargeUnknown':True,'fdFinal':after['fd'],'cleanupConfirmedInWitness':True})
assert r['initial']['pass']==0 and r['initial']['fail']==2 and r['initial']['EMC']=='NOT_RUN fail-fast'
summary={'initialSubject':r['base'],'correctedSubject':r['executedCorrectedCode'],'delivery':'be9da96ca8c118db7845691956eaa4c6c3eca44a','makerReceiptSHA256':'5ac68f579b7572a332f9401ad85983203a07d0ad39c88631118135b3f9246006','publicReceiptFilesHashVerified':len(r['files']),'sourceBlobRowsPerSubjectVerified':249,'overlapNotSummed':True,'privateRawFiles':r['privateRaw']['count'],'privateRawBytesIndependentlyVerifiedByRoot':False,'makerNativeCorrected':w['corrected'],'rootNativeReexecution':False,'scopedCodeReview':'only audit envelope SHA changed; product material canonical/depth12/schema and all assertions unchanged, no new confirmed P0/P1/P2','originalAppSQLRoleGrantCapsUnchanged':True,'cases':cases,'fullFormalApproval':False,'pending':r['pending']}
(p/'root-review.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))

from pathlib import Path
import json,zipfile,stat,re,hashlib,subprocess
p=Path('/tmp/stockinsider-pr381-reuse-hosted-oct14');a=json.loads((p/'artifact-metadata.json').read_text())['artifacts'][0];dest=p/'export'
b=(p/'download.zip').read_bytes(); digest=hashlib.sha256(b).hexdigest(); assert len(b)==a['size_in_bytes'] and a['digest']=='sha256:'+digest
assert a['workflow_run']['head_sha']=='c68864cd4125b2dc5e9249312ef9188bfdedcb82'
upstream={'SHA256SUMS','builder-canonical.log','builder-canonical.tap','builder-correctness.json','package.json','packaged-boot.json','packaged-boot.stderr','packaged-boot.stdout','release-manifest.json','review-binding.json','source-identity.txt','stockinsider-linux.tar.gz','verification.json'}
roots={'builder-canonical.log','builder-canonical.tap','builder-correctness.json','reuse-review-binding.json','upstream-run.json','upstream-artifact-metadata.json','reuse-provenance.json','reuse-full-verification.json','packaged-boot.json','packaged-boot.stdout','packaged-boot.stderr','SHA256SUMS'}
expected=roots|{'upstream/'+n for n in upstream}
with zipfile.ZipFile(p/'download.zip') as z:
 assert z.testzip() is None; entries=z.infolist(); assert len(entries)==len(expected) and {i.filename for i in entries}==expected
 for i in entries:
  assert not i.is_dir() and stat.S_IFMT(i.external_attr>>16) in (0,stat.S_IFREG) and not(i.flag_bits&1)
  assert (dest/i.filename).read_bytes()==z.read(i)
lines=(dest/'SHA256SUMS').read_text().splitlines(); assert len(lines)==24; seen=set()
for row in lines:
 m=re.fullmatch(r'([0-9a-f]{64})  \./([A-Za-z0-9_.\-/]+)',row); assert m and m[2] in expected-{'SHA256SUMS'} and m[2] not in seen;seen.add(m[2]); assert hashlib.sha256((dest/m[2]).read_bytes()).hexdigest()==m[1]
assert seen==expected-{'SHA256SUMS'}
for n in upstream: assert (dest/'upstream'/n).read_bytes()==(Path('/tmp/stockinsider-pr381-hosted-artifact-oct14/export')/n).read_bytes(),n
correct=json.loads((dest/'builder-correctness.json').read_text()); tap=(dest/'builder-canonical.tap').read_text(); th=hashlib.sha256(tap.encode()).hexdigest()
assert correct['runId']=='38590834521' and correct['canonicalSectionSha256']==th
assert len(re.findall(r'^TAP version 13$',tap,re.M))==1 and re.findall(r'^1\.\.(\d+)$',tap,re.M)==['155']
results=re.findall(r'^(?:not )?ok\b.*$',tap,re.M)
assert len(results)==155
for i,line in enumerate(results,1):
 m=re.fullmatch(r'ok (\d+) - (.+)',line);assert m and int(m[1])==i
 assert not re.search(r'\s+#\s*(?:SKIP|TODO)\b',m[2],re.I)
assert not re.search(r'^\s*(?:not ok\b|Bail out!)',tap,re.M)
for key,val in {'tests':155,'pass':155,'fail':0,'cancelled':0,'skipped':0,'todo':0}.items():assert re.findall(r'^# '+key+r' (\d+)$',tap,re.M)==[str(val)]
assert re.findall(r'^ok \d+ - acceptance (PCR-\d{3})$',tap,re.M)==['PCR-'+str(i).zfill(3) for i in range(1,32)]
assert correct['executionTree']=='8ab201731bcf2a1a99e71393ac9a7e18d01ed36c' and correct['executionWebTree']=='c516655efaac8260b1bcf5938f8f4d65ab61ad44'
verify=json.loads((dest/'reuse-full-verification.json').read_text()); assert verify['releaseVerified'] is True and verify['sourceCommit']==verify['packagerCommit']=='dd59817f750684b093965f539dd4de466be13077'
assert verify['manifestSha256']=='344489589e929158a73d658c968128a563dd53ed9a5eac6b37ee89553b9a0a4a'
proof=json.loads((dest/'reuse-provenance.json').read_text()); boot=json.loads((dest/'packaged-boot.json').read_text()); binding=json.loads((dest/'reuse-review-binding.json').read_text())
assert proof['applicationRebuilt'] is False and proof['upstreamTestsAttributedToCurrentBuilder'] is False and proof['currentRunId']=='38590834521'
assert boot['reusedArtifactId']==11904225538 and boot['unconfiguredAuthStatus']==500 and boot['fixtureUnavailableStatus']==404 and boot['productionReadinessProven'] is False and boot['privatePeerOrLiveDataProven'] is False
assert boot['confirmedProcessExit']['code']==143 or boot['confirmedProcessExit']['signal']=='SIGTERM'
assert boot['assetSha256']=='0973c1d64c88adc8e3c950410cb58b288f72118d5965b78049438deb8f2f9683'
assert binding['builderWorkflowSha']==correct['executionSubject'] and binding['runId']=='38590834521' and binding['directChildEvidence']=='c2b146adb6d03814f2bd9a7af72baf003bb48812'
z=zipfile.ZipFile(p/'hosted-logs.zip'); assert z.testzip() is None
summary={'artifactId':a['id'],'zipBytes':len(b),'zipSHA256':digest,'memberCount':len(expected),'allSHA256SUMSVerified':True,'all13UpstreamFilesByteEqualToOriginal':True,'canonical155':True,'PCR31':True,'canonicalSectionSHA256':th,'builderSubject':correct['executionSubject'],'builderTree':correct['executionTree'],'applicationRebuilt':False,'currentFullVerifier':verify,'currentPackagedBoot':boot,'logsZipSHA256':hashlib.sha256((p/'hosted-logs.zip').read_bytes()).hexdigest(),'rootBuildOrBoot':False}
(p/'root-hosted-verification.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))

from pathlib import Path
import json,subprocess,os,hashlib,copy
root=Path('/tmp/stockinsider-artifact-reuse-static-oct14')
base=root/'actual-archive'; base.mkdir(exist_ok=False)
export=base/'standalone-export'; export.mkdir()
metadata=json.loads(Path('/tmp/stockinsider-pr381-hosted-artifact-oct14/artifact-metadata.json').read_text())['artifacts'][0]
run=json.loads((root/'upstream-run.json').read_text())
(export/'upstream-artifact-metadata.json').write_text(json.dumps(metadata))
(export/'upstream-run.json').write_text(json.dumps(run))
os.link('/tmp/stockinsider-pr381-hosted-artifact-oct14/download.zip',base/'reviewed-existing-artifact.zip')
env={**os.environ,'RUNNER_TEMP':str(base),'GITHUB_SHA':'e902021ee9df537d4a8da2a2eaff3921084d44d7','GITHUB_RUN_ID':'local-readonly-parser-probe'}
script=root/'exact-inline-verifier.py'
r=subprocess.run(['python3',str(script)],env=env,capture_output=True)
(root/'actual-archive.stdout').write_bytes(r.stdout); (root/'actual-archive.stderr').write_bytes(r.stderr)
assert r.returncode==0,r.stderr
# Full original verifier, no build or server execution on this Mac.
r=subprocess.run(['arch','-arm64','/usr/local/bin/node','/tmp/stockinsider-pr381-hosted-artifact-oct14/approved-source-verifier.mjs',str(base/'reviewed-standalone/dd59817f750684b093965f539dd4de466be13077')],capture_output=True)
(root/'original-full-verifier.stdout').write_bytes(r.stdout); (root/'original-full-verifier.stderr').write_bytes(r.stderr)
assert r.returncode==0,r.stderr
cases=[('expired',lambda m,u:m.update(expired=True)),('wrong-id',lambda m,u:m.update(id=1)),('wrong-digest',lambda m,u:m.update(digest='sha256:'+'0'*64)),('wrong-head',lambda m,u:m['workflow_run'].update(head_sha='0'*40)),('failed-run',lambda m,u:u.update(conclusion='failure')),('wrong-repo',lambda m,u:u['repository'].update(id=1)),('wrong-size',lambda m,u:m.update(size_in_bytes=1))]
results=[]
for name,mutate in cases:
 folder=root/name; (folder/'standalone-export').mkdir(parents=True)
 m,u=copy.deepcopy(metadata),copy.deepcopy(run); mutate(m,u)
 (folder/'standalone-export/upstream-artifact-metadata.json').write_text(json.dumps(m))
 (folder/'standalone-export/upstream-run.json').write_text(json.dumps(u))
 result=subprocess.run(['python3',str(script)],env={**env,'RUNNER_TEMP':str(folder)},capture_output=True)
 (folder/'stderr').write_bytes(result.stderr)
 assert result.returncode!=0 and not (folder/'standalone-export/upstream').exists(),name
 results.append({'case':name,'exit':result.returncode,'noExtraction':True})
folder=root/'wrong-zip'; (folder/'standalone-export').mkdir(parents=True)
(folder/'standalone-export/upstream-artifact-metadata.json').write_text(json.dumps(metadata))
(folder/'standalone-export/upstream-run.json').write_text(json.dumps(run))
# Same size but different digest: reject before opening/parsing the ZIP.
with (folder/'reviewed-existing-artifact.zip').open('wb') as f:f.truncate(28254621)
result=subprocess.run(['python3',str(script)],env={**env,'RUNNER_TEMP':str(folder)},capture_output=True)
(folder/'stderr').write_bytes(result.stderr)
assert result.returncode!=0 and not (folder/'standalone-export/upstream').exists()
results.append({'case':'wrong-zip','exit':result.returncode,'noExtraction':True})
summary={'actualHashBoundArchiveParse':True,'originalFullVerifier':json.loads(r.stdout),'negativeRejects':results,'rootBuild':False,'rootBoot':False,'hostedNewWorkflowRun':False,'sourceCandidateUncommitted':True}
(root/'root-validation.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))

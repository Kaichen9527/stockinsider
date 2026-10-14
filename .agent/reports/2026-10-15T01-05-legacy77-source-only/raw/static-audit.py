# Read/hash only. No app import or native/test execution.
import json,hashlib,pathlib,subprocess,gzip,base64
repo=pathlib.Path.cwd();index=json.loads((repo/'scripts/fixtures/research-legacy77/source-index.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
raw=(repo/index['fixture']['path']).read_bytes();assert sha(raw)==index['fixture']['sha256'];assert len(raw)==index['fixture']['bytes'];expanded=gzip.decompress(raw);assert len(expanded)==index['fixture']['expandedBytes'];capsule=json.loads(expanded)
actual=[]
for row in capsule['files']:
 pin=row['pin'];b=base64.b64decode(row['rawBase64']);original=subprocess.check_output(['git','show',index['source']+':'+pin['file']]);assert b==original;assert len(b)==pin['bytes'] and sha(b)==pin['sha256'];actual.append(pin)
assert actual==index['files'];mapping=json.loads(base64.b64decode(next(x for x in capsule['files'] if x['pin']['file'].endswith('/research-complete-mapping.json'))['rawBase64']))
metadata=[{k:row[k] for k in ['file','bytes','sha256']} for row in actual[:22]];assert metadata==mapping['sourceClosure'];canonical=json.dumps(metadata,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode();assert sha(canonical)=='77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41'
old=json.loads(gzip.decompress((repo/'scripts/fixtures/research-compatible-financial/pinned-original-source.json.gz').read_bytes()));oldBy={f['pin']['path']:f for f in old['files']}
for pin in index['oldArtifactPins']:
 b=base64.b64decode(oldBy[pin['path']]['rawBase64']);assert len(b)==pin['bytes'] and sha(b)==pin['sha256'];assert b==subprocess.check_output(['git','show','75d91024ce365606989bfe42b2d7e6227b65044d:'+pin['path']])
for pin in index['sqlComparisons']:
 b=(repo/pin['file']).read_bytes();assert sha(b)==pin['sha256'];assert b==subprocess.check_output(['git','show',index['source']+':'+pin['file']])
base='c462a51ceea1b69026b38ec40b105eb971d24116';head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();diff=subprocess.check_output(['git','diff','--name-only',base,head],text=True).splitlines()
assert len(diff)==7 and all(p.startswith(('scripts/opportunity-v3/research-legacy77','scripts/opportunity-v3/research-versioned-legacy77','scripts/fixtures/research-legacy77','docs/operations/2026-10-15/legacy77')) or p=='scripts/opportunity-v3/research-versioned-legal-fixture-helper.mjs' for p in diff)
print(json.dumps({'subject':head,'source':index['source'],'originalClosure':sha(canonical),'closureMembersCompared':22,'totalCopiedOriginalFiles':len(actual),'copiedOriginalBytes':sum(x['bytes'] for x in actual),'oldArtifactBytesCompared':len(index['oldArtifactPins']),'sqlByteComparisons':len(index['sqlComparisons']),'candidateChangedPaths':diff,'fixture':index['fixture'],'native':'NOT_RUN','appImports':'NOT_RUN'},indent=2))

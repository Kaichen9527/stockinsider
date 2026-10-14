from pathlib import Path
import subprocess,json,hashlib,gzip,base64,datetime,os,shutil
repo=Path('/tmp/si-pubtail-o14');p=Path('/tmp/compat-session-o14');head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();legacy='15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb';artifact='75d91024ce365606989bfe42b2d7e6227b65044d';base='1ff6d59a0bd4e37c69a251a2ea2b144a66ebb479';sha=lambda b:hashlib.sha256(b).hexdigest();git=lambda *a:subprocess.check_output(['git',*a],cwd=repo);source=lambda r,f:git('show',r+':'+f)
changes=git('diff','--name-only',base,head).decode().splitlines();assert len(changes)==12
assert not any(x.startswith(('migrations/','.github/','web/src/app/')) for x in changes)
# Historical fixture inventory and projection provenance, independently compared as bytes/subtrees.
oldInv=source(legacy,'web/src/lib/research-financial-inventory.ts').decode();oldInv=json.loads(oldInv[oldInv.index('{'):oldInv.rindex('}')+1]);fixture=json.loads(gzip.decompress((repo/'scripts/fixtures/research-compatible-financial/pinned-original-source.json.gz').read_bytes()));rows=[]
for f in fixture['files']:
 pin=f['pin'];raw=base64.b64decode(f['rawBase64']);assert raw==source(artifact,pin['path']);assert len(raw)==pin['bytes']and sha(raw)==pin['sha256'];assert pin in oldInv['companies'][f['symbol']];rows.append({'symbol':f['symbol'],**pin,'blob':git('rev-parse',artifact+':'+pin['path']).decode().strip()})
assert len(rows)==14
old=source(legacy,'web/src/lib/research-financial-supplement.ts').decode();new=(repo/'web/src/lib/research-compatible-financial-projection.ts').read_text();oldbody=old[old.index('function project('):old.index('export async function loadResearchFinancialSupplement')];newbody=new[new.index('export function projectCompatibleFinancial('):];assert newbody.replace('export function projectCompatibleFinancial(','function project(',1)==oldbody
helpers=old[old.index('const PERIODS'):old.index('export function parseFinancialSupplementRequest')];assert helpers in new
validator=source(legacy,'web/src/lib/research-complete-canonical.ts');expected=validator.replace(b"'./research-financial-clock.ts'",b"'../../../web/src/lib/research-financial-clock.ts'");assert (repo/'scripts/fixtures/research-compatible-financial/legacy-complete-canonical.ts').read_bytes()==expected
schema=[]
for sym in ['2409','2383']:
 original=source(legacy,f'web/src/lib/research-complete-{sym}.schema.json');subset=json.loads(original)['properties']['financialMaterial'];assert json.loads((repo/f'scripts/fixtures/research-compatible-financial/{sym}-financial-material.schema.json').read_text())==subset;schema.append({'symbol':sym,'originalSchemaBytes':len(original),'originalSchemaSha256':sha(original),'subtreeExact':True})
for f in ['web/src/lib/research-business-calculator.ts','web/src/lib/research-financial-clock.ts']:assert(repo/f).read_bytes()==source(base,f)==source(legacy,f)
(p/'compatibility-source-proof.json').write_text(json.dumps({'legacyContract':legacy,'oldArtifactCommit':artifact,'artifacts':rows,'projectBodyOriginalSha256':sha(oldbody.encode()),'projectExportRenameOnly':True,'helpersByteExact':True,'helpersSha256':sha(helpers.encode()),'schemas':schema,'validatorImportOnlyRelocated':True,'originalValidatorSha256':sha(validator),'coreAndClockUnchangedFromBothReferences':True,'normalization':'delete projection.sourceManifestHash and calculation inputHash/resultHash/executionCodeHash, same15d4 completeMaterial; no manufactured wrapper/sourceClosureHash'},indent=2)+'\n')
# All runtime inputs in the pre-quality WIP seal match the frozen code subject.
wip=json.loads((p/'final-wip-before-test.json').read_text());equiv=[]
for r in wip:
 b=(repo/r['file']).read_bytes();assert len(b)==r['bytes']and sha(b)==r['sha256'],r['file'];equiv.append(r)
(p/'quality-wip-equivalence.json').write_text(json.dumps({'codeCommit':head,'qualityExecutedBeforeCodeCommit':True,'sealedWip':'final-wip-before-test.json','allSealedInputsStillExact':equiv,'laterChanges':'only handoff/fixture README added before code commit; no runtime/test/descriptor change after sealed WIP or quality'},indent=2)+'\n')
desc=json.loads((repo/'scripts/fixtures/research-historical-cash/new-reader-execution-closure.json').read_text());assert len(desc['files'])==17
for r in desc['files']:
 b=(repo/r['file']).read_bytes();assert len(b)==r['bytes']and sha(b)==r['sha256']
assert sha(json.dumps(desc['files'],sort_keys=True,separators=(',',':')).encode())==desc['sourceClosureHash']
paths=set(changes)|{r['file']for r in desc['files']}|{'scripts/research-cash-single-owner-reader.test.mjs','scripts/research-historical-cash-core.test.mjs','scripts/research-historical-cash-projection.test.mjs','scripts/research-scenario-cash-material.test.mjs','scripts/research-scenario-cash-reader.test.mjs','scripts/fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz'}
manifest=[]
for f in sorted(paths):
 b=(repo/f).read_bytes();assert b==source(head,f);manifest.append({'file':f,'bytes':len(b),'sha256':sha(b),'blob':git('rev-parse',head+':'+f).decode().strip()})
(p/'source-manifest.json').write_text(json.dumps({'head':head,'tree':git('rev-parse',head+'^{tree}').decode().strip(),'webTree':git('rev-parse',head+':web').decode().strip(),'files':manifest},indent=2)+'\n')
compiled=[]
for f in sorted((repo/'web/.next/server').rglob('*')):
 if f.is_file():b=f.read_bytes();compiled.append({'file':str(f.relative_to(repo/'web/.next')),'bytes':len(b),'sha256':sha(b)})
(p/'compiled-server-manifest.json').write_text(json.dumps(compiled,indent=2)+'\n')
(p/'build-identity.json').write_text(json.dumps({'codeCommitEquivalent':head,'executedAgainstSealedWip':True,'BUILD_ID':(repo/'web/.next/BUILD_ID').read_text(),'node':'22.14.0','next':json.loads((repo/'web/node_modules/next/package.json').read_text())['version'],'files':len(compiled),'serverManifestSha256':sha((p/'compiled-server-manifest.json').read_bytes()),'webTree':git('rev-parse',head+':web').decode().strip()},indent=2)+'\n')
print(head,'source',len(manifest),'compiled',len(compiled),'closure',desc['sourceClosureHash'])

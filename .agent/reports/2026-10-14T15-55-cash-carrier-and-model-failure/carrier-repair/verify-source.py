from pathlib import Path
import subprocess,json,hashlib,datetime
r=Path.cwd();out=Path('/tmp/stockinsider-cash-carrier-fix-oct14');source=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();base='e2dcb6c20b71561dfb37d7728809b0be257d8fe2'
def blob(s,p):return subprocess.check_output(['git','show',s+':'+p])
pinpath='web/src/lib/research-historical-cash-pins.ts'
def pins(s):
 text=blob(s,pinpath).decode();return json.JSONDecoder().raw_decode(text[text.index('{\n  "profile"'):])[0]
a,b=pins(base),pins(source);assert b['limits'].pop('carrier')==1048576
for v in b['companies'].values():v.pop('carrier')
assert a==b
changed=subprocess.check_output(['git','diff','--name-only',base,source],text=True).splitlines();assert set(changed)=={'docs/operations/2026-10-14/historical-cash-projection-handoff.md','scripts/research-historical-cash-projection.test.mjs','web/src/lib/research-historical-cash-pins.ts','web/src/lib/research-historical-cash-projection.ts'}
identities=[]
for path in subprocess.check_output(['git','diff','--name-only','b7796da8',source],text=True).splitlines():
 data=blob(source,path);assert data==(r/path).read_bytes();identities.append({'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'blob':subprocess.check_output(['git','rev-parse',source+':'+path],text=True).strip()})
unchanged=['web/src/lib/research-historical-cash-core.ts','scripts/research-historical-cash-core.test.mjs','scripts/fixtures/research-historical-cash/operands-and-decimal-vectors.json','scripts/fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz','.github/workflows/research-historical-cash-quality.yml','.github/workflows/source-led-opportunity-v3.yml']
for path in unchanged:assert blob(base,path)==blob(source,path)
proof={'source':source,'stackedBase':'b7796da8a92b99284b133a7a622e490a23bad11b','repairBase':base,'tree':subprocess.check_output(['git','rev-parse',source+'^{tree}'],text=True).strip(),'changedPaths':changed,'stacked7fileIdentities':identities,'originalPinsIdenticalAfterRemovingOnlyCarrierFields':True,'unchangedPaths':unchanged,'actualTests':'29 PASS = core14 + projection15; zero failures/skips/todos; not additive with previous 11/12','strictModuleOnlyTypes':True,'appBuildLintTypesOrNativePG':'not run by Root; pending exact-lock ordinary quality','formalOrProtectedAcceptance':False,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(out/'source-verification.json').write_text(json.dumps(proof,indent=2));print(json.dumps({k:v for k,v in proof.items()if k!='stacked7fileIdentities'}))
(out/'root-verification-initial-error.json').write_text(json.dumps({'initialError':'ValueError: substring not found','cause':'Root verification incorrectly searched for }); suffix; actual TS pins end } as const);','correction':'JSONDecoder.raw_decode only the exact exported object','productSourceChanged':False}))
(out/'report.md').write_text('''# Bounded carrier candidate repair

Source '''+source+''' is sealed and pushed, code review pending. Independent R2 fbf454d4 and design a4c95096 are retained as separate subjects. All former Maps are unsupported; static issuer length, ordinary fixed backing, owned copy and whole-carrier SHA precede UTF8/JSON/base64. Only new carrier fields/cap were added to pins; every original raw/semantic pin is identical. Core, old fixture, workflows, authority, SQL, financial installer, locks and protected/oracle bytes remain unchanged by this repair.

Actual final source29PASS(core14+projection15)/zeroFAIL/SKIP/TODO and module-only TypeScript5.9.3 PASS. Former Map iteration/own-property variants, hostile JS getters/proxies/backing stores, serialized unknown/duplicate/order/base64/hash drift before parse, caller mutation after copy, original output hashes and every cooperative-deadline cleanup path are covered. First14PASS1FAIL instrumented cleanup witness included Node module-loader allocations; next sealed test-only change scopes records to actual execution. First compiler invocation failedTS2688 from absent @types lookup; corrected explicit external typeRoots used. Both original RED outputs retained; no product acceptance was weakened.

No actual9/7 filesystem reader/custody, hard wall-clock cancellation, total1MiB memory cap, complete immutable-string erasure, scenario+cash schema, legacy replay/quota/fence/publication or formal research acceptance is claimed. Root did not app-build/lint/nativePG on Mac. New full exact-lock quality and independent code closure are pending. Parent PR379 is ready/open with its new protected model gate failed; no merge/deploy or retry performed.
''')

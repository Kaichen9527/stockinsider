from pathlib import Path
import json,subprocess,hashlib,os,re,datetime
root=Path('/tmp/stockinsider-discovery-snapshot-root-review-oct14'); out=Path('/tmp/stockinsider-pr381-reuse-fresh-exact-oct14');change='.loop-engineering/state/changes/source-led-opportunity-engine-v3'; dest=out/change
head='c68864cd4125b2dc5e9249312ef9188bfdedcb82';base='5189547f76bf24c002b8e8b11669081ba67ad2c6';tree='8ab201731bcf2a1a99e71393ac9a7e18d01ed36c'
pcr=json.loads((dest/'pcr-fulfillment-record-v1.json').read_text());graph=pcr['activeGraphSha256'];assert graph=='c8576f1b60613ab0b424c9a6315ee64dee9c3d14d81c49dae10834bd66bc7e0a'
host=json.loads(Path('/tmp/stockinsider-pr381-reuse-hosted-oct14/root-hosted-verification.json').read_text())
text=f'''# Exact reviewed artifact reuse workflow integration

Result: `PASS`

P0=0 P1=0 P2=0

- Final reviewed repair/tree: `{head}` / `{tree}`
- Full final range: `{base}..{head}`
- Active graph: `{graph}`

This is unsigned model-agent code-integration evidence, not a human signature or formal installer, source, article, strategy or production approval. Root authored the two workflow/handoff files. Cloud independently reviewed the original full workflow, requested two P2 repairs at93f6b60a, and approved their exact closure atf4309e9af61cf4f9767e8a627105c3586d02f192. Cloud then read the full current workflow/handoff and independently reviewed the reuse delta atd2640246c5b7136fcf8e2420156508987632929e, receipt9c25e4eed0a3f6d4b4d730ccb2d2d35922aca5afb8c32aa5f943d0396fcaa2b9. Root verified all51 evidence files, both exact candidate blobs and10 supporting subject/path/blob/hash records, inspected the complete delta and actual hosted output. Root is not represented as independently approving its own code. Independent scope and actual execution are composed explicitly below.

## Requirements and complete-range inheritance — PASS

All2190 tracked base5189 entries are byte/mode/type-identical. The full range adds only .github/workflows/reviewed-publication-tail-artifact.yml and docs/operations/2026-10-14/reviewed-publication-artifact-handoff.md. Application/web treec516, runtime/SQL/roles/authority/locks, original protected workflows/oracle/trust policies and financial48/49/50/publication26 expectations remain unchanged. Inherited approved code is carried unchanged, not falsely claimed newly authored or reread in full. No separate source grants or unfinished protocol candidate are included.

The bounded functional change reuses the successful DD package11904225538 from38580440366 instead of building/repacking the same target again. DD source and genuine direct evidenceC2B remain distinct from this builder and main. The original8bcd package stays distinct. Fixed upstream inputs have no caller override or fallback build. No production credentials, production DB address, migration, deployment or approval issuance is added. Current canonical tests retain their original isolated local PG fixtures.

## Architecture and independent code review — PASS

First checkout/Node22.14/locks/original official PG17 signing fingerprint and setup/locked Chromium/complete canonical155+31 parser are unchanged from the independently reviewed e902 closure. Browser provisioning precedes consumers. Complete TAP requires one header/plan,155 ordered unique passing IDs, zero failures/cancel/skip/todo, no result directives/bailout and all31 named PCR cases; summary claims alone are insufficient.

Only actions:read is added alongside contents:read to retrieve a fixed existing run/artifact. The builtin GitHub token is explicitly injected only in that fixed download step; this does not claim process-level token isolation. All action pins and persist-credentials:false remain. No protected paths, parser, oracle, trust policy or approved expectation changes. Second checkout obtains genuineC2B, detaches toDD, verifies exact tree/web/clean source and invokes the original runtime resolver. That resolver accepted DD/C2B and rejected merge-source/non-child cases in three genuine read-only Git-object checks.

Fixed API metadata validates run/artifact/repository/head/success/expiry/size and ZIP digest before parsing. Exact13 regular ZIP members, aggregate bound and all12 original hashes are checked. Tar identity is fixed before parsing;3101 entries/2587 regular files/79955758 bytes are required, with traversal, duplicate paths, links/special files, backslashes and privileged modes rejected before extraction. The original DD verifier is itself SHA-bound and verifies all release members, modes, hashes and aggregate. The fixed package is never rebuilt or repacked. Missing/expired/drifted input fails closed without fallback.

Current builder receipts and reused verification/boot are separate from upstream13 original files. New loopback production boot uses a minimal credential-free environment, exact missing-auth500, fixture404, static bytes/SHA and confirmed TERM/KILL cleanup. Expected500 is fail-closed configuration behavior, not production health. Always-upload includes actual job status; failed partial output cannot prove a release. Upstream test/build results are not attributed to this current builder.

Independent36 isolated predicate probes,10shell/3Node/1Python syntax and three real Git resolver checks passed; they are not an actual archive or application suite. Root separately parsed the real pinned upstream archive and ran the unchanged DD full verifier with eight metadata/digest negative controls; this was local file verification, no Mac build/boot. The following hosted execution supplies the actual current workflow result.

## Actual new hosted execution — PASS, distinct provenance

PR381 source{head}/base{base}. Run38590834521/job115944948137 completedSUCCESS. Actual builder checkout{host['builderSubject']} has sole two parents base5189+headc688 and full tree{tree}, equal to the reviewed head. Root fetched and verified the Git object; direct head checkout is not claimed. Complete new actual TAP SHA256{host['canonicalSectionSHA256']} has155PASS/0FAIL/0cancel/0skip/0todo and31 distinct actual named PCR cases. The unchanged fulfillment writer recomputed all31 fixture/owner/caller/result-dependency/active-graph records against the current subject using this new execution, recordSHA{pcr['recordSha256']}. Old42f2/e902/oldDD stdout and synthetic reporter controls do not supply these fields.

The new verified-reuse artifact{host['artifactId']} has25 safe members, ZIP{host['zipBytes']}bytes/SHA{host['zipSHA256']} matching GitHub digest; Root verifiedCRC, every current SHA256SUMS row, and byte equality of all13 upstream files against the originally verified11904225538 download. Original tar remains398e71768ea0e7a5935282432c0edfcb2f47c953712b715562def95c3745add4. Original canonical manifest body344489589e929158a73d658c968128a563dd53ed9a5eac6b37ee89553b9a0a4a/raw receipt127d7d9427c0122c547021b9a9a01e4b1d3ce960087a0cef1796e1b88e0ae943 and2586files/79354761bytes remain unchanged.

Current original full verifier returned releaseVerified:true. Current packaged boot Node22.14 recorded500/404/staticSHA0973c1d64c88adc8e3c950410cb58b288f72118d5965b78049438deb8f2f9683/confirmed exit143. applicationRebuilt:false and productionReadinessProven/privatePeerOrLiveDataProven:false remain explicit. Original DD107/7/4/type/lint/build at38580440366 stays attributed to that upstream run, not a new build. Current hosted logs ZIP SHA{host['logsZipSHA256']} is retained.

## Original RED and unverified production scope

Initial current-head protected38590829287 attempt1 genuinely failed fetching the absent new source-addressed exact-ref; bootstrapPASS/modelproductSKIP/aggregateFAIL and complete raw log remain. This review publication is not an already-completed protected gate. Original e90238580440510 attempt1 missing-ref and attempt2 exact-review reviewed commit/tree format failure remain RED; published977df0a is append-only and was not overwritten. The corrected cd792 sibling remains a local proposal and is not reused as this subject's evidence. This genuinely changed source receives its own new direct-child proof with the unchanged worker grammar. No force update, parser relaxation, empty commit or CI skip repairs the old evidence.

Peer probe RED from its overly broad nine-step harness and sandbox Git EPERM are preserved; corrected lightweight probes ran in the actual permitted context. Root's first archive-check harness wrongly matched summary '# todo 0' as a test directive; its exact expression/error/match was saved, then only the harness was corrected to check result lines. Actual hosted TAP/product output and workflow predicates were unchanged; no CI rerun was used to conceal it.

The unique literals below bind only unchanged inherited installer source. They are not fixed private peer/HBA, current VPSLOGIN6, capacity, financial/publication migration or deployment approval.50selected is not50executed.

'''
old=subprocess.check_output(['git','cat-file','blob','cd79278dbff631db471a55b11b2e9ca47f77bef2:'+change+'/exact-commit-review-final.md'],cwd=root,text=True)
prefixes=['Financial history ordered chain SHA256:','Financial existing-schema ordered profile SHA256:','Financial VPS operator prerequisite SHA256:','Publication tail ordered chain SHA256:','Publication tail descriptor SHA256:','Publication tail captured-post50 baseline SHA256:']
for prefix in prefixes:
 lines=[l for l in old.splitlines() if l.startswith(prefix)];assert len(lines)==1;text+=lines[0]+'\n'
text+='\nNormal protected gates/ready/merge, capacity/privatepeer/production installation/deployment/current-writer/desktop-mobile acceptance remain pending. Main5189/current169/NOLOGIN-1/4030730240 deficit are last known observations. All source/rootcreator/Top20, two formally role-bound independently published articles, strategies/technical observation and formal research schedule remain incomplete. Local versioned-input/native candidates are not included or formally approved by this release. No profit or investment eligibility is invented.\n'
assert re.search(r'^- Final reviewed repair/tree: `'+head+r'` / `'+tree+r'`$',text,re.M)
assert re.search(r'^- Full final range: `'+base+r'\.\.'+head+r'`$',text,re.M)
assert re.search(r'^- Active graph: `'+graph+r'`$',text,re.M)
review=dest/'exact-commit-review-final.md';review.write_text(text)
att={'schema':'stockinsider-exact-review-attestation-v1','baseSha':base,'headSha':head,'treeSha':tree,'range':base+'..'+head,'verdict':'PASS','p0':0,'p1':0,'evidenceSha256':hashlib.sha256(review.read_bytes()).hexdigest(),'reviewedAt':datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
(dest/'runtime-review-attestation.json').write_text(json.dumps(att,sort_keys=True,separators=(',',':'))+'\n')
env={**os.environ,'GIT_INDEX_FILE':str(out/'private-index')}
def git(args,**kw): return subprocess.check_output(['git',*args],cwd=root,env=env,**kw)
git(['read-tree',head]);paths=sorted([change+'/'+n for n in ['exact-commit-review-final.md','pcr-fulfillment-record-v1.json','runtime-review-attestation.json']])
for name in paths:
 assert subprocess.run(['git','cat-file','-e',head+':'+name],cwd=root,capture_output=True).returncode!=0
 oid=git(['hash-object','-w','--stdin'],input=(out/name).read_bytes()).decode().strip();git(['update-index','--add','--cacheinfo','100644',oid,name])
t=git(['write-tree']).decode().strip(); child=git(['commit-tree',t,'-p',head],input=b'Independent exact review and actual canonical evidence for artifact reuse\n').decode().strip()
rows=git(['diff-tree','--no-commit-id','--name-status','-r',head,child]).decode().splitlines();assert rows==['A\t'+n for n in paths];assert git(['show','-s','--format=%P',child]).decode().strip()==head
subprocess.run(['git','update-ref','refs/heads/codex/pr381-reuse-exact-evidence-oct14',child],cwd=root,check=True)
summary={'source':head,'base':base,'tree':tree,'directChild':child,'reviewSHA256':att['evidenceSha256'],'reviewedAt':att['reviewedAt'],'PCRrecordSHA256':pcr['recordSha256'],'canonicalExecutionSHA256':host['canonicalSectionSHA256'],'evidenceOnlyPaths':paths,'published':False,'formalPeerOrProductionApproved':False}
(out/'direct-child.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))

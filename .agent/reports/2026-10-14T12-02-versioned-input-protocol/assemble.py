import pathlib,subprocess,json,hashlib,re
r=pathlib.Path.cwd(); old='15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb'; tail='dd59817f750684b093965f539dd4de466be13077'; records=[]
def read(s,p):return subprocess.check_output(['git','show',s+':'+p])
def copy(s,p,dest=None):
 b=read(s,p);q=r/(dest or p)
 if q.exists():
  if q.read_bytes()!=b: raise Exception('existing different '+str(q))
 else:q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b)
 records.append({'subject':s,'path':p,'destination':str(q.relative_to(r)),'blob':subprocess.check_output(['git','rev-parse',s+':'+p],text=True).strip(),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
for p in ['web/src/lib/research-complete-schema-bundles.ts','web/src/lib/research-complete-mapping.json'] :copy(old,p)
d=json.loads(read(tail,'scripts/opportunity-v3/research-publication-tail-descriptor.json'))
for x in d['entries']:copy(tail,x['relativePath'])
# Exact local captured prerequisites, no whole branch merge; only required runtime imports.
for p in ['research-publication-tail-descriptor.json','research-publication-tail-extraction.mjs','research-publication-tail-atomic-client.mjs','research-publication-tail-entry-guard.mjs','research-publication-tail-entry-namespace.mjs','research-publication-tail-post50-baseline.json','research-publication-install-guard.mjs','research-publication-catalog.mjs','research-publication-install-profile.json']:
 copy(tail,'scripts/opportunity-v3/'+p)
pathlib.Path('/tmp/versioned-protocol-implementation-o14/copied-inputs.json').write_text(json.dumps(records,indent=2)+'\n')
# Exact old parent/parser code extracted; original functions/SQL untouched.
s=read(old,'web/src/lib/research-complete-input.ts').decode();block=s[s.index('type Row='):s.index('export async function readCompleteBody')]
(r/'web/src/lib/research-versioned-input-request.ts').write_text("// Original15d4 ten-key parser; new module identity, unchanged request contract.\nimport {completeEnsure as ensure,completeCanonical} from './research-v3-material-canonical.ts';\n"+block)
sql=read(old,'migrations/20261009_research_complete_input_v2.sql').decode()
parent=sql[sql.index('CREATE FUNCTION public.research_complete_parent_v2'):sql.index('CREATE FUNCTION public.read_research_article_input_revision_v2')]
parent=parent.replace('research_complete_parent_v2','research_complete_parent_candidate_v3').replace(' m jsonb;',' m jsonb;')
parent=parent.replace("m:=public.research_complete_mapping_v2(old.payload->>'symbol');\n IF m IS NULL OR m->>'inventoryHash' IS DISTINCT FROM p_request->>'expectedArtifactManifestHash' OR m->>'sourceClosureHash' IS DISTINCT FROM p_request->>'expectedCalculatorExecutionHash' THEN RAISE EXCEPTION 'complete_mapping_unavailable';END IF;", "m:=public.research_input_binding_candidate_v3(old.payload->>'symbol',p_request->>'expectedArtifactManifestHash',p_request->>'expectedCalculatorExecutionHash',false);")
parent=parent.replace(' RETURN replay;', " RETURN jsonb_build_object('preparation',replay,'binding',m,'contextHash',public.research_complete_hash_v2(jsonb_build_object('request',p_request,'preparationHash',old.input_hash,'sourceSeal',old.source_seal_id,'binding',m->>'bindingCapsuleIdentity')));")
pathlib.Path('/tmp/versioned-protocol-implementation-o14/parent.sql').write_text(parent)
# Body pins for original functions that the new candidate directly relies on.
pins=[]
for name,sig in [('research_complete_parent_v2','jsonb'),('read_research_article_input_revision_v2','jsonb'),('seal_research_article_input_revision_v2','jsonb,jsonb')]:
 m=re.search(r'CREATE FUNCTION public\.'+name+r'\(.*?AS \$\$(.*?)\$\$;',sql,re.S); assert m
 pins.append((name+'('+sig+')',hashlib.sha256(m.group(1).encode()).hexdigest()))
pathlib.Path('/tmp/versioned-protocol-implementation-o14/predecessor-pins.json').write_text(json.dumps(pins,indent=2)+'\n')

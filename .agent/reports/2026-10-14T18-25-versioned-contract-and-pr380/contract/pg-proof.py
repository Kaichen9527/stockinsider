import os,pathlib,subprocess,json,hashlib,tempfile,shutil,pwd,time
base=pathlib.Path('/tmp/versioned-contract-o14');bin=pathlib.Path('/workspace/cloud-acceptance-0faebfd/tools/root/usr/lib/postgresql/17/bin');env=dict(os.environ);env['USER']=pwd.getpwuid(os.geteuid()).pw_name;env['PATH']=str(bin)+':'+env['PATH'];pgroot=pathlib.Path(tempfile.mkdtemp(prefix='si-v3size-',dir='/tmp'));data=pgroot/'data';port=58143;active=False
sha=lambda b:hashlib.sha256(b).hexdigest()
def run(name,args,input=None):
 p=subprocess.run([str(bin/name),*args],input=input,text=True,capture_output=True,env=env,timeout=90);(base/'raw'/('pg-'+name+'.stdout')).open('a').write(p.stdout);(base/'raw'/('pg-'+name+'.stderr')).open('a').write(p.stderr)
 if p.returncode:raise RuntimeError(name+' exit'+str(p.returncode)+' '+p.stderr[:700])
 return p.stdout
sql=(base/'source/migrations/20261009_research_complete_input_v2.sql').read_text();start=sql.index('CREATE FUNCTION public.research_complete_canonical_v2');end=sql.index('CREATE FUNCTION public.research_complete_mapping_v2');funcs=sql[start:end]
# Exact original declarations only, no altered body, grants or roles; transaction rolls them back.
(base/'canonical-original-functions.sql').write_text(funcs)
q=lambda v:"'"+json.dumps(v,ensure_ascii=False,separators=(',',':')).replace("'","''")+"'::jsonb"
queries=[]
for symbol in ['2409','2383']:
 m=json.loads((base/f'material-{symbol}.json').read_text());sc=json.loads((base/f'finite-shape-{symbol}.json').read_text());clock=m['artifactReadKnownAt']
 queries.append(f"SELECT jsonb_build_object('symbol','{symbol}','pgVersion',current_setting('server_version'),'jsonbTextBytes',octet_length(({q(m)})::text),'pgPhysicalValueBytes',pg_column_size({q(m)}),'projectionJsonbTextBytes',octet_length(({q(m)}->'projection')::text),'taggedBytes',octet_length(research_complete_canonical_v2({q(m)})),'taggedHash',research_complete_hash_v2({q(m)}));")
 queries.append(f"SELECT research_complete_schema_check_v2({q(m)},{q(sc)},'{clock}'::timestamptz);")
 for label,bad in [('financialVerified',dict(m,financialVerified=True)),('extra',dict(m,extra=True)),('forecastCash',dict(m,forecastCash=1))]:
  queries.append(f"DO $probe$ BEGIN BEGIN PERFORM research_complete_schema_check_v2({q(bad)},{q(sc)},'{clock}'::timestamptz);RAISE EXCEPTION 'unexpected_accept' USING ERRCODE='XX000';EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;END;END $probe$; SELECT jsonb_build_object('symbol','{symbol}','negative','{label}','rejected',true);")
# No formal rows/IDs are inserted. This is an explicit source-manifest sizing boundary, not a full preparation or accepted source proof.
manifest=[{'id':f'00000000-0000-4000-8000-{i:012d}','rowHash':'a'*64,'root':'https://example.invalid/'+str(i)+'/'+('x'*(4096-len('https://example.invalid/'+str(i)+'/'))),'publishedAt':None,'observedAt':'2026-10-14T09:00:00+00:00','rights':'bounded_summary_only'} for i in range(30)]
(base/'source-manifest-sizing-fixture.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
queries.append(f"SELECT jsonb_build_object('scope','synthetic 30 source manifest only; root length4096 each','count',jsonb_array_length({q(manifest)}),'jsonbTextBytes',octet_length(({q(manifest)})::text),'taggedBytes',octet_length(research_complete_canonical_v2({q(manifest)}))); ")
body='BEGIN; SET LOCAL statement_timeout=\'60s\';'+funcs+'\n'+'\n'.join(queries)+'\nROLLBACK;SELECT jsonb_build_object(\'cleanupFunctionAbsent\',to_regprocedure(\'public.research_complete_canonical_v2(jsonb,integer)\') IS NULL);'
(base/'executed-measurement.sql').write_text(body);(base/'probe-input-seal.json').write_text(json.dumps({'probeSha':sha(pathlib.Path(__file__).read_bytes()),'originalFunctionSha':sha(funcs.encode()),'sqlSha':sha(body.encode()),'pgbin':str(bin),'osUser':env['USER'],'syntheticLocalOnly':True},indent=2))
try:
 run('initdb',['-D',str(data),'-U',env['USER'],'-A','trust','--no-instructions']);run('pg_ctl',['-D',str(data),'-l',str(pgroot/'pg.log'),'-o',f"-h '' -k {pgroot} -p {port}",'-w','start']);active=True
 output=run('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',str(pgroot),'-p',str(port),'-d','postgres'],body)
 rows=[json.loads(x) for x in output.splitlines() if x.startswith('{')];expected=json.loads((base/'material-measurements.json').read_text())
 for r in rows:
  if 'taggedHash'in r:
   e=next(x for x in expected if x['symbol']==r['symbol']);assert r['taggedHash']==e['taggedHash'] and r['taggedBytes']==e['taggedBytes']
 assert rows[-1]['cleanupFunctionAbsent'];(base/'pg-measurements.json').write_text(json.dumps(rows,indent=2));print(json.dumps(rows,indent=2))
finally:
 if active:run('pg_ctl',['-D',str(data),'-m','fast','-w','stop'])
 if (pgroot/'pg.log').exists():shutil.copyfile(pgroot/'pg.log',base/'raw/pg-server.log')
 shutil.rmtree(pgroot);(base/'pg-cleanup.json').write_text(json.dumps({'cluster':str(pgroot),'removed':not pgroot.exists(),'stopped':True,'rolesAdded':False,'schemaTransactionRolledBack':True}))

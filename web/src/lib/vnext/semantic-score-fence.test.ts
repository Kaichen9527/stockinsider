import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../../',import.meta.url);
const read=(path:string)=>readFileSync(new URL(path,root),'utf8');
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const profile=JSON.parse(read('scripts/opportunity-v3/vnext-semantic-score-profile-v1.json')) as {
 migration:string;migrationSha256:string;source:{path:string;sha256:string};referenceCatalogSnapshot:{path:string;sha256:string};nativeVerified:boolean;nativeOids:null;observedCatalogMetadata:null;
 routines:Array<{signature:string;predecessorBodySha256:string;successorBodySha256:string;predecessorBytes:number;successorBytes:number;old:string;new:string}>;
};
const migration=read(profile.migration),original=read(profile.source.path);
function body(signature:string){const name=signature.split('.')[1].split('(')[0];const start=original.indexOf(`CREATE FUNCTION public.${name}(`);assert.ok(start>=0);const begin=original.indexOf(' AS $$',start)+6,end=original.indexOf('$$;',begin);assert.ok(begin>5 && end>begin);return original.slice(begin,end);}
test('semantic fence pins exact original two source bodies and finite reversible successors without native metadata claims',()=>{
 assert.equal(sha(migration),profile.migrationSha256);assert.equal(sha(original),profile.source.sha256);assert.equal(profile.nativeVerified,false);assert.equal(profile.nativeOids,null);assert.equal(profile.observedCatalogMetadata,null);
 assert.deepEqual(profile.routines.map(row=>row.signature),['public.vnext_deep_score_v1(jsonb)','public.vnext_thesis_project_v1(jsonb)']);
 for(const row of profile.routines){const before=body(row.signature);assert.equal(sha(before),row.predecessorBodySha256);assert.equal(Buffer.byteLength(before),row.predecessorBytes);assert.equal(before.split(row.old).length,2);const after=before.replace(row.old,row.new);assert.equal(sha(after),row.successorBodySha256);assert.equal(Buffer.byteLength(after),row.successorBytes);assert.equal(after.replace(row.new,row.old),before);for(const pin of [row.signature,row.predecessorBodySha256,row.successorBodySha256,row.old,row.new])assert.ok(migration.includes(pin));}
});
test('only supported valuation/technical scoring remains reachable; current projection recomputes before unchanged ranking and preserves missing report null',()=>{
 const score=profile.routines[0],project=profile.routines[1];const scored=body(score.signature).replace(score.old,score.new);const projected=body(project.signature).replace(project.old,project.new);
 assert.equal(score.old,"  ELSE\n   required:=");assert.equal(score.new,"  ELSIF factor='technicalChips' THEN\n   required:=");
 assert.ok(scored.includes("weight:=CASE factor WHEN 'valuation' THEN 30 WHEN 'profitability' THEN 25 WHEN 'technicalChips' THEN 20 WHEN 'catalysts' THEN 15 ELSE 10 END;factor_value:=NULL;"));
 assert.equal(project.old,"'deepScore',CASE WHEN current_sources THEN latest_report->'deepScore' ELSE NULL END");assert.equal(project.new,"'deepScore',CASE WHEN current_sources AND latest_report IS NOT NULL AND jsonb_typeof(latest_report->'deepInputs')='object' THEN public.vnext_deep_score_v1(latest_report->'deepInputs') ELSE NULL END");
 assert.ok(projected.indexOf(project.new)<projected.indexOf('jsonb_agg(value ORDER BY'));assert.ok(projected.includes("'sourceRights',jsonb_build_object('current',current_sources"));assert.ok(projected.includes("FOR item IN SELECT * FROM jsonb_array_elements(document->'history') LOOP"));
 assert.ok(original.includes("score:=public.vnext_deep_score_v1(item->'deepInputs');"));assert.ok(original.includes('ON CONFLICT DO NOTHING'));
});
test('installer retains reviewed whole-catalog snapshot with only exact two prosrc excluded and introduces no source privileges/rows/objects',()=>{
 const reference=read(profile.referenceCatalogSnapshot.path);assert.equal(sha(reference),profile.referenceCatalogSnapshot.sha256);
 const before=reference.split('$catalog$')[1],after=migration.split('$catalog$')[1];assert.equal(after,before.replace('p.oid=$1','p.oid=ANY($1)'));
 assert.ok(migration.includes("SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';"));assert.equal((migration.match(/pg_advisory_xact_lock\(64221022\)/gu)||[]).length,1);
 for(const guard of ['array_position(targets,NULL)','before_namespace USING targets','after_namespace USING targets','after_namespace IS DISTINCT FROM before_namespace',"to_jsonb(p)-'prosrc'",'a.grantee<>p.proowner','a.grantor<>p.proowner','a.is_grantable','p.proconfig=ARRAY','p.pronargdefaults=0','p.proargdefaults IS NULL','p.prosecdef=spec.security_definer','replace(changed,spec.new_fragment,spec.old_fragment) IS DISTINCT FROM original'])assert.ok(migration.includes(guard),guard);
 const code=migration.replace(/--[^\n]*/gu,'');assert.doesNotMatch(code,/\b(?:CREATE\s+(?:TABLE|FUNCTION|ROLE)|ALTER\s+|GRANT\s+|REVOKE\s+|INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/iu);assert.equal((code.match(/EXECUTE replace\(definition,original,changed\)/gu)||[]).length,1);
});

/** STATIC SOURCE ONLY: literal PostgreSQL replace reconstruction, no SQL/native execution. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('additive SQL patch has exact predecessor/successor body pins and rejects bare quote/check clocks without ACL changes',()=>{
 const base=readFileSync(new URL('../migrations/20261022_vnext_thesis_audit_v1.sql',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../migrations/20261115_vnext_weekly_quote_clock_v1.sql',import.meta.url),'utf8');
 let body=base.split('CREATE FUNCTION public.vnext_deep_score_v1(input jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$')[1].split('$$;')[0]
  .replace('  ELSE\n   required:=',"  ELSIF factor='technicalChips' THEN\n   required:=");
 const hash=value=>createHash('sha256').update(value).digest('hex');
 assert.equal(hash(body),'12b3cf00b3558c1e80008c7ba905e6482e7c9ef4fc7f5f50df71fd644a27044c');
 const predecessor=body,fragments=[];
 for(let i=0;i<3;i++){
  const old=sql.split(`$old${i}$`)[1],next=sql.split(`$new${i}$`)[1];fragments.push({old,next});assert.equal(body.split(old).length,2);body=body.replace(old,()=>next);
 }
 assert.equal(hash(body),'fa2aea3377a3cc60d7e69ecd567d4ca10d596789e89e097d936798d01695044e');
 assert.equal(Buffer.byteLength(body,'utf8'),4496);
 let reversed=body;for(const {old,next} of [...fragments].reverse())reversed=reversed.replaceAll(next,()=>old);
 assert.equal(reversed,predecessor);
 assert.match(body,/quoteObservedAt/u);assert.match(body,/quoteKnownAt/u);assert.match(body,/AT TIME ZONE 'Asia\/Taipei'/u);
 assert.doesNotMatch(body,/quoteAt'\)::timestamptz|valuationAt'\)::timestamptz/u);
 assert.match(sql,/weekly_quote_clock_private_acl_changed/u);assert.match(sql,/weekly_quote_clock_namespace_changed/u);
 assert.doesNotMatch(sql,/GRANT |ALTER ROLE|UPDATE public\.|INSERT INTO public\./u);
 assert.ok(sql.trimEnd().endsWith('COMMIT;')); // STATIC, not PostgreSQL execution or timezone parity proof
});
test('SQL regex dollar-quote anchor is literal data, never a JavaScript replacement template',()=>{
 const source='prefix OLD suffix',replacement="zone-regex$' AND known-clock";
 const literal=source.replace('OLD',()=>replacement),template=source.replace('OLD',replacement);
 assert.equal(literal,"prefix zone-regex$' AND known-clock suffix");
 assert.notEqual(template,literal);assert.equal(template,"prefix zone-regex suffix AND known-clock suffix");
});

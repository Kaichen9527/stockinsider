import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, cp, writeFile, symlink, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {parseWorkingDraft} from './research-working-draft.ts';
import {loadReadOnlyWorkingDraft, workingDraftPreviewEnabled} from './research-working-draft-loader.ts';
const root = path.resolve(import.meta.dirname,'../../..');
const folder = 'docs/research/2026-10-08-emc-company-model';
const md = await readFile(path.join(root,folder,'article.md'),'utf8');
const meta = JSON.parse(await readFile(path.join(root,folder,'draft-metadata.json'),'utf8'));
for (const symbol of ['2409','2383']) test(`${symbol} actual artifact renders seven chapters, original tables and direct citations without formal authority`, async()=>{
  const draft = await loadReadOnlyWorkingDraft(root,symbol);
  assert.equal(draft.state,'working_draft'); assert.equal(draft.sections.length,7);
  assert.equal(draft.published,false); assert.equal(draft.targetPrice,null);
  assert.ok(draft.sections.some(s=>s.blocks.some(b=>b.kind==='table')));
  assert.ok(draft.sources.filter(s=>s.url).length>=10);
  assert.ok(draft.appendix.some(b=>b.kind==='table' && b.rows.length===18));
  assert.ok(!('scenarios' in draft)); assert.ok(!('job' in draft));
});
test('preview requires explicit local demo flag; default and production remain disabled',()=>{
  assert.equal(workingDraftPreviewEnabled({}),false);
  assert.equal(workingDraftPreviewEnabled({DATA_MODE:'live',RESEARCH_WORKING_DRAFT_PREVIEW:'enabled'}),false);
  assert.equal(workingDraftPreviewEnabled({DATA_MODE:'demo',RESEARCH_WORKING_DRAFT_PREVIEW:'enabled'}),true);
});
test('published/qualification/strategy/target mutations are never accepted as working draft',()=>{
  for(const [key,value] of [['published',true],['researchQualified',true],['strategyApproved',true],['targetPrice',6000]])
    assert.throws(()=>parseWorkingDraft('2383',md,{...meta,[String(key)]:value}));
});
test('nanosecond cutoff after authored clock rejects, original clocks stay exact',()=>{
  assert.throws(()=>parseWorkingDraft('2383',md,{...meta,cutoffAt:meta.authoredAndCheckedAt.replace('+00:00','Z').replace('.051875','.051875001')}));
  const d=parseWorkingDraft('2383',md,meta); assert.equal(d.evidenceCutoffAt,meta.cutoffAt);
});
test('private/credential/javascript citation URLs reject rather than silently disclose',()=>{
  for(const url of ['http://127.0.0.1/x','https://user:pass@example.org/a','javascript:alert(1)','https://example.org/?token=probe'])
    assert.throws(()=>parseWorkingDraft('2383',md.replace(/\[F\]: \S+/,`[F]: ${url}`),meta));
});
test('missing/duplicate references and malformed or oversized tables reject',()=>{
  assert.throws(()=>parseWorkingDraft('2383',md.replace('[F]:','[ZZ]:').replace(/\[F\]/g,'[MISSING]'),meta));
  assert.throws(()=>parseWorkingDraft('2383',md+'\n[F]: https://example.org/',meta));
  assert.throws(()=>parseWorkingDraft('2383',md.replace('|季|收入|毛利|OP|歸母|已報稀釋EPS|','|bad|'),meta));
  assert.throws(()=>parseWorkingDraft('2383','x'.repeat(128001),meta));
});
test('HTML stays plain paragraph data and local historical reference has no fabricated URL/date',()=>{
  const d=parseWorkingDraft('2383',md.replace('## 一、','<script>alert(1)</script>\n\n## 一、'),meta);
  assert.ok(d.summary.includes('<script>'));
  assert.ok(d.sources.every(s=>s.publicationInstant===null));
});
test('unsupported symbols never become paths',async()=>{
  await assert.rejects(loadReadOnlyWorkingDraft(root,'../../etc/passwd'));
});
test('changed bytes, model/cutoff binding, and symlink artifact reject',async()=>{
  const tmp=await mkdtemp(path.join(os.tmpdir(),'working-draft-test-'));
  try {
    await mkdir(path.join(tmp,'docs/research'),{recursive:true});
    await cp(path.join(root,folder),path.join(tmp,folder),{recursive:true});
    const file=path.join(tmp,folder,'article.md');
    await writeFile(file,md+'x'); await assert.rejects(loadReadOnlyWorkingDraft(tmp,'2383'),/manifest/);
    await rm(file); await symlink(path.join(root,folder,'article.md'),file);
    await assert.rejects(loadReadOnlyWorkingDraft(tmp,'2383'));
    await rm(file); await writeFile(file,md);
    const m=JSON.parse(await readFile(path.join(tmp,folder,'model-results.json'),'utf8')); m.asOf='2026-10-09T00:00:00Z';
    await writeFile(path.join(tmp,folder,'model-results.json'),JSON.stringify(m));
    await assert.rejects(loadReadOnlyWorkingDraft(tmp,'2383'));
  }finally{await rm(tmp,{recursive:true});}
});

test('both future author and cutoff reject against actual reader clock; no historical clock rewriting',()=>{
  assert.throws(()=>parseWorkingDraft('2383',md,{...meta,cutoffAt:'2027-01-01T00:00:00Z',authoredAndCheckedAt:'2027-01-01T00:00:01Z'},'2026-10-08T12:45:00Z'),/future/);
});

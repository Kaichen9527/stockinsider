import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { putCandidateFinancialArtifact, readCandidateFinancialArtifact } from './candidate-financial-artifact.ts';

test('Contabo candidate documents use private hash storage and bind a database receipt', async () => {
  const priorMode=process.env.STOCKINSIDER_DATA_PLANE, priorRoot=process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT;
  const temporary=await mkdtemp(path.join(os.tmpdir(),'candidate-artifact-'));
  const root=path.join(await realpath(temporary),'private'); await mkdir(root,{mode:0o700});
  const bytes=Buffer.from('private-financial-document-fixture');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const calls:Array<Record<string,unknown>>=[];
  const client={rpc:async (_name:string,args:Record<string,unknown>)=>{calls.push(args);return{data:{},error:null};}} as never;
  try {
    process.env.STOCKINSIDER_DATA_PLANE='contabo'; process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT=root;
    await putCandidateFinancialArtifact({client,objectKey:'ignored',sha256,bytes,contentType:'application/pdf'});
    const restored=await readCandidateFinancialArtifact({client,objectKey:'ignored',sha256});
    assert.deepEqual(restored,bytes);
    assert.equal(calls.length,1);
    assert.equal(calls[0]?.p_artifact_hash,sha256);
    assert.equal(calls[0]?.p_purpose,'financial_document');
    restored.fill(0);
  } finally {
    if(priorMode===undefined)delete process.env.STOCKINSIDER_DATA_PLANE;else process.env.STOCKINSIDER_DATA_PLANE=priorMode;
    if(priorRoot===undefined)delete process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT;else process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT=priorRoot;
    await rm(temporary,{recursive:true,force:true});
  }
});

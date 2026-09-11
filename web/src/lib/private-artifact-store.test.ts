import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, stat, link, unlink, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { privateArtifactStore } from './private-artifact-store.ts';
const bytes=Buffer.from('%PDF-1.7 fixture financial document');
const hash=createHash('sha256').update(bytes).digest('hex');
test('publication window and concurrent callers preserve immutable input',async()=>{
  const root=await mkdtemp('/private/tmp/stockinsider-artifact-test-');
  try {
    const store=privateArtifactStore(root);
    const mutable=Buffer.from(bytes);
    const pending=store.put(hash,mutable);
    mutable.fill(0);
    await pending;
    const final=`${root}/${hash.slice(0,2)}/${hash}`;
    const temporary=`${root}/${hash.slice(0,2)}/.pending-fixture`;
    // Deterministically hold the exact link→unlink publication interleaving.
    await link(final,temporary);
    assert.equal((await stat(final)).nlink,2);
    assert.deepEqual(await store.read(hash),bytes);
    const results=await Promise.all(Array.from({length:8},()=>store.put(hash,bytes)));
    assert.ok(results.every(result=>result.created===false));
    await unlink(temporary);
    assert.deepEqual(await store.read(hash),bytes);
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('untrusted writable ancestors are rejected',async()=>{
  const parent=await mkdtemp('/private/tmp/stockinsider-artifact-test-');
  try {
    const root=`${parent}/private`; await mkdir(root,{mode:0o700});
    await chmod(parent,0o777);
    await assert.rejects(privateArtifactStore(root).put(hash,bytes),/artifact_ancestor_untrusted/);
  } finally { await rm(parent,{recursive:true,force:true}); }
});
test('immutable hash storage is private, idempotent, and preserves verified bytes',async()=>{
  const root=await mkdtemp('/private/tmp/stockinsider-artifact-test-');
  try {
    const store=privateArtifactStore(root);
    assert.equal((await store.put(hash,bytes)).created,true);
    assert.equal((await store.put(hash,bytes)).created,false);
    assert.deepEqual(await store.read(hash),bytes);
    assert.equal((await stat(`${root}/${hash.slice(0,2)}/${hash}`)).mode&0o777,0o600);
    await assert.rejects(store.put(hash,Buffer.from('modified')),/artifact_input_invalid/);
    assert.deepEqual(await store.read(hash),bytes);
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('tampering, traversal and symlink targets fail without overwrite',async()=>{
  const root=await mkdtemp('/private/tmp/stockinsider-artifact-test-');
  try {
    const store=privateArtifactStore(root);
    await assert.rejects(store.put('../x',bytes),/artifact_hash_invalid/);
    await mkdir(`${root}/${hash.slice(0,2)}`,{mode:0o700});
    const outside=`${root}/other`;
    await writeFile(outside,bytes,{mode:0o600});
    const target=`${root}/${hash.slice(0,2)}/${hash}`;
    await symlink(outside,target);
    await assert.rejects(store.put(hash,bytes));
    assert.deepEqual(await readFile(outside),bytes);
    await rm(target); await writeFile(target,Buffer.from('bad'),{mode:0o600});
    await assert.rejects(store.read(hash),/artifact_integrity_failed/);
    await assert.rejects(store.put(hash,bytes),/artifact_integrity_failed/);
    assert.equal(await readFile(target,'utf8'),'bad');
  } finally { await rm(root,{recursive:true,force:true}); }
});

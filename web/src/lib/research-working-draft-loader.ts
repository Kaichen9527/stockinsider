import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { researchCanonicalHash } from './research-agent-qualification.ts';
import { parseWorkingDraft } from './research-working-draft.ts';
const folders = { '2409':'2026-10-08-auo-four-segment-model', '2383':'2026-10-08-emc-company-model' } as const;
export function workingDraftPreviewEnabled(env: Record<string, string | undefined>): boolean {
  return env.DATA_MODE === 'demo' && env.RESEARCH_WORKING_DRAFT_PREVIEW === 'enabled';
}
export async function readBoundedWorkingDraftArtifact(root: string, relative: string): Promise<Buffer> {
  const parts = relative.split('/');
  if (parts.some(p => !p || p === '..' || p === '.')) throw new Error('invalid fixed path');
  let current = root;
  for (const part of parts.slice(0,-1)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('draft directory boundary');
  }
  const filename = path.join(root, relative), leaf = await lstat(filename);
  if (!leaf.isFile() || leaf.isSymbolicLink()) throw new Error('draft non-regular leaf');
  // NONBLOCK also closes the lstat/open race: a replacement FIFO never waits
  // for a writer before the authoritative descriptor fstat rejects it.
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({bigint:true});
    if (!before.isFile() || before.size > BigInt(512_000)) throw new Error('draft file bound');
    const buffer = Buffer.alloc(512_001);
    let length = 0;
    while (length < buffer.length) {
      const {bytesRead} = await handle.read(buffer, length, buffer.length-length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const raw = buffer.subarray(0, length), after = await handle.stat({bigint:true});
    if (before.size !== BigInt(raw.length) || before.size !== after.size || before.ctimeNs !== after.ctimeNs || before.mtimeNs !== after.mtimeNs) throw new Error('draft changed during read');
    return raw;
  } finally { await handle.close(); }
}
/** No arbitrary filename, DB, fetch, claim, model call, or write. All snapshots must agree. */
export async function loadReadOnlyWorkingDraft(root: string, symbol: string) {
  if (symbol !== '2409' && symbol !== '2383') throw new Error('unsupported draft symbol');
  const folder = `docs/research/${folders[symbol]}`;
  const files = ['article.md','draft-metadata.json','model-results.json','hashes.json'];
  const raws = await Promise.all(files.map(file => readBoundedWorkingDraftArtifact(root, `${folder}/${file}`)));
  const hash = (raw: Buffer) => createHash('sha256').update(raw).digest('hex');
  const meta = JSON.parse(raws[1].toString()), model = JSON.parse(raws[2].toString()), manifest = JSON.parse(raws[3].toString());
  for (let i = 0; i < 3; i++) {
    const matches = manifest.files.filter((r: {file: string}) => r.file === `${folder}/${files[i]}`);
    if (matches.length !== 1 || matches[0].bytes !== raws[i].length || matches[0].sha256 !== hash(raws[i])) throw new Error('draft manifest mismatch');
  }
  const {canonicalHash, inputManifest, ...body} = model;
  void inputManifest;
  if (model.symbol !== symbol || canonicalHash !== researchCanonicalHash(body) || canonicalHash !== meta.modelCanonicalHash
    || canonicalHash !== manifest.canonicalModelHash || hash(raws[0]) !== meta.articleSha256
    || model.asOf !== (meta.cutoffAt ?? meta.evidenceCutoffAt)
    || model.published !== false || model.strategyApproved !== false) throw new Error('draft model/binding mismatch');
  return parseWorkingDraft(symbol, raws[0].toString(), meta);
}

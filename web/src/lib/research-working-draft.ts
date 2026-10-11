import { sanitizePublicSourceUrl } from './public-source-url.ts';
import { sourceControllerInstant } from './research-source-attempt-controller.ts';

export type WorkingDraftBlock = { kind: 'paragraph'; text: string; citations: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] };
export type WorkingDraftSection = { key: string; title: string; blocks: WorkingDraftBlock[] };
/** Display-only state: never a candidate-deep-research-v1 article or entry qualification. */
export type ReadOnlyResearchDraft = {
  state: 'working_draft'; symbol: '2409' | '2383'; title: string; summary: string;
  authoredAt: string; evidenceCutoffAt: string; articleSha256: string; modelCanonicalHash: string;
  sections: WorkingDraftSection[]; appendix: WorkingDraftBlock[];
  sources: { key: string; url: string | null; title: string; publicationInstant: null }[];
  published: false; researchQualified: false; strategyApproved: false; targetPrice: null;
};
const text = (v: unknown): string => { if (typeof v !== 'string' || !v.length) throw new Error('missing draft string'); return v; };
export function parseWorkingDraft(symbol: '2409' | '2383', markdown: string, meta: Record<string, unknown>, now = new Date().toISOString()): ReadOnlyResearchDraft {
  if (Buffer.byteLength(markdown) > 128_000 || markdown.includes('\0')) throw new Error('draft body bound');
  if (meta.status !== 'draft/incomplete' || meta.published !== false || meta.researchQualified !== false
    || meta.strategyApproved !== false || meta.targetPrice !== null || meta.historicalPITEligible !== false) throw new Error('draft authority boundary');
  const authoredAt = text(meta.authoredAndCheckedAt ?? meta.authoredAndVerifiedAt);
  const evidenceCutoffAt = text(meta.cutoffAt ?? meta.evidenceCutoffAt);
  if (sourceControllerInstant(evidenceCutoffAt) > sourceControllerInstant(authoredAt)) throw new Error('draft cutoff after author');
  if (sourceControllerInstant(authoredAt) > sourceControllerInstant(now)) throw new Error('future draft author clock');
  const sources: ReadOnlyResearchDraft['sources'] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const match = /^\[([A-Z]+)\]: (\S+)(?: "([^"]*)")?$/.exec(line);
    if (!match) continue;
    if (sources.some(s => s.key === match[1])) throw new Error('duplicate citation');
    const raw = match[2], url = sanitizePublicSourceUrl(raw);
    // Never display credential-bearing URLs after merely stripping their query.
    if (url && new URL(raw).search !== new URL(url).search) throw new Error('unsafe citation query');
    if (!url && !raw.startsWith('../../../web/src/lib/')) throw new Error('unsafe citation');
    sources.push({ key: match[1], url, title: match[3] || match[1], publicationInstant: null });
  }
  const sections: WorkingDraftSection[] = [], appendix: WorkingDraftBlock[] = [], preface: WorkingDraftBlock[] = [];
  let blocks = preface, title = '', inAppendix = false;
  const cells = (line: string) => line.slice(1, -1).split('|').map(s => s.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^\[[A-Z]+\]: /.test(line) || line === '</details>') continue;
    if (line.startsWith('# ')) { if (title) throw new Error('duplicate title'); title = line.slice(2); continue; }
    if (line.startsWith('<details>')) { inAppendix = true; blocks = appendix; continue; }
    if (line.startsWith('## ')) {
      if (inAppendix) { blocks.push({kind:'paragraph', text:line.slice(3), citations:[]}); continue; }
      const section = { key: `draft-${sections.length + 1}`, title: line.slice(3), blocks: [] as WorkingDraftBlock[] };
      sections.push(section); blocks = section.blocks; continue;
    }
    if (line.startsWith('|') && line.endsWith('|')) {
      const headers = cells(line), separator = lines[++i]?.trim();
      if (!separator || !cells(separator).every(c => /^:?-+:?$/.test(c)) || cells(separator).length !== headers.length) throw new Error('invalid table separator');
      const rows: string[][] = [];
      while (lines[i + 1]?.trim().startsWith('|')) rows.push(cells(lines[++i].trim()));
      if (headers.length > 20 || rows.length > 100 || rows.some(r => r.length !== headers.length)) throw new Error('table bound/shape');
      blocks.push({kind:'table', headers, rows}); continue;
    }
    // Unknown HTML is displayed as escaped text by React, never evaluated.
    const citations = [...new Set([...line.matchAll(/\[([A-Z]+)\]/g)].map(m => m[1]))];
    if (citations.some(k => !sources.some(s => s.key === k))) throw new Error('missing citation');
    blocks.push({kind:'paragraph', text:line, citations});
  }
  if (!title || sections.length !== 7 || sources.length > 40) throw new Error('draft chapter/source bounds');
  return {state:'working_draft', symbol, title, summary:preface.filter(b=>b.kind==='paragraph').map(b=>b.text).join('\n'),
    authoredAt,evidenceCutoffAt,articleSha256:text(meta.articleSha256),modelCanonicalHash:text(meta.modelCanonicalHash),
    sections,appendix,sources,published:false,researchQualified:false,strategyApproved:false,targetPrice:null};
}

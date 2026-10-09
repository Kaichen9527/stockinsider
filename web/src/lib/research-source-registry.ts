/** Acquisition capability is not proof that a platform was read. */
export const RESEARCH_SOURCE_PLATFORMS = [
  'official', 'news', 'broker', 'ptt', 'investanchors', 'threads', 'instagram',
  'facebook', 'podcast', 'youtube', 'telegram', 'bulltalk', 'twse_insider',
] as const;
export type ResearchSourcePlatform = typeof RESEARCH_SOURCE_PLATFORMS[number];
export type ResearchContentForm = 'research_summary' | 'transcript_excerpt' | 'chapter_titles';
export type ResearchAcquisitionMethod = 'public_document' | 'publisher_transcript'
  | 'authenticated_browser_summary' | 'user_authorized_document';
export type ResearchTimedExcerpt = { startSeconds: number; endSeconds: number | null; text: string };

export function normalizeResearchPlatform(value: string): string {
  return value.toLowerCase().replace(/^research_inbox_/u, '');
}

export function validateResearchTimedExcerpts(value: unknown): value is ResearchTimedExcerpt[] {
  if (!Array.isArray(value) || value.length > 12) return false;
  let previous = -1;
  let characters = 0;
  for (const row of value) {
    if (!row || typeof row !== 'object' || !Number.isFinite(row.startSeconds)
      || row.startSeconds < 0 || row.startSeconds > 86_400 || row.startSeconds < previous
      || row.endSeconds !== null && (!Number.isFinite(row.endSeconds)
        || row.endSeconds < row.startSeconds || row.endSeconds > 86_400)
      || typeof row.text !== 'string' || !row.text.trim() || row.text.length > 400) return false;
    previous = row.startSeconds;
    characters += row.text.length;
  }
  return characters <= 1200;
}

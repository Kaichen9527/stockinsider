import { evidenceInstant } from './evidence-clock.ts';

export type OwnerResearchNote = Readonly<{
  source: 'investanchors' | 'telegram';
  statement: string;
  publishedAt: string;
}>;

export type OwnerNotesReader = (verifiedSubject: string) => Promise<OwnerResearchNote[] | null>;

function plainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function project(raw: unknown): OwnerResearchNote[] {
  if (!Array.isArray(raw) || raw.length > 20) throw Error('owner_research_projection_invalid');
  return raw.map(value => {
    if (!plainRecord(value) || Object.keys(value).sort().join('|') !== 'publishedAt|source|statement') {
      throw Error('owner_research_projection_invalid');
    }
    const { source, statement, publishedAt } = value;
    if ((source !== 'investanchors' && source !== 'telegram')
      || typeof statement !== 'string' || !statement.trim() || Array.from(statement).length > 320
      || typeof publishedAt !== 'string' || evidenceInstant(publishedAt) === null) {
      throw Error('owner_research_projection_invalid');
    }
    return { source, statement, publishedAt };
  });
}

/** Bind verified OIDC subjects to explicitly configured source-rights subjects.
 * Browser input supplies neither identity, selector nor upstream credentials. */
export function createOwnerNotesReader(
  configuredBindings: string | undefined,
  read: (rightsSubject: string) => Promise<unknown>,
): OwnerNotesReader | undefined {
  if (!configuredBindings || configuredBindings.length > 6144) return undefined;
  let entries: unknown;
  try { entries = JSON.parse(configuredBindings); } catch { return undefined; }
  if (!plainRecord(entries) || Object.keys(entries).length < 1 || Object.keys(entries).length > 20) return undefined;

  const bindings = new Map<string, string>();
  const rightsSubjects = new Set<string>();
  for (const [subject, rightsSubject] of Object.entries(entries)) {
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(subject) || typeof rightsSubject !== 'string'
      || !/^[A-Za-z0-9_.:-]{1,128}$/u.test(rightsSubject) || rightsSubjects.has(rightsSubject)) return undefined;
    bindings.set(subject, rightsSubject);
    rightsSubjects.add(rightsSubject);
  }
  return async subject => {
    const rightsSubject = bindings.get(subject);
    return rightsSubject === undefined ? null : project(await read(rightsSubject));
  };
}

export async function readOwnerNotesFromDataPlane(rightsSubject: string): Promise<unknown> {
  const { getSupabaseServerClient } = await import('../supabase-server.ts');
  const result = await getSupabaseServerClient().rpc('vnext_owner_research_notes_v1', {
    p_rights_subject: rightsSubject,
  }).abortSignal(AbortSignal.timeout(4500));
  if (result.error) throw Error('owner_research_unavailable');
  return result.data;
}

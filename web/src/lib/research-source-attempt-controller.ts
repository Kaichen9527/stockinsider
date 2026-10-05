import { createHash } from 'node:crypto';
import { sanitizePublicSourceUrl } from './public-source-url.ts';
import { researchCanonicalHash } from './research-agent-qualification.ts';
import { buildResearchInboxRow, researchInboxContentHash, validateResearchInboxItem, type ResearchInboxItem } from './research-inbox.ts';
import { researchRootFromDocument } from './research-source-roots.ts';
import { RESEARCH_SOURCE_PLATFORMS, type ResearchSourcePlatform } from './research-source-registry.ts';
import { CREATOR_PUBLISHED_PODCAST_RSS_INDEX_ALLOWLIST, SOURCE_CONNECTOR_KEYS, sourceExecutionPolicy } from './source-policy.ts';
import type { ResearchSourceAttempt } from './research-agent-priority.ts';

export const SOURCE_CONTROLLER_POLICY = 'research-source-attempt-controller-v1';
export const SOURCE_CONTROLLER_LIMITS = Object.freeze({ scopes: 20, pagesPerScope: 1,
  bodyBytes: 4_000_000, timeoutMs: 12_000, runMs: 60_000, inputBytes: 2_000_000, priorItems: 1000 });
export type SourceContentScope = 'article_body' | 'official_document' | 'transcript' | 'metadata_index';
export type SourceOutcome = 'read_success' | 'read_failed' | 'not_attempted' | 'auth_required' | 'metadata_only'
  | 'missing_transcript' | 'awaiting_summary' | 'item_ready' | 'duplicate' | 'future_source';
export type SourceRights = { basis: 'official_public_document' | 'creator_published_index'
  | 'authorized_local_summary'; checkedAt: string; checkedBy: string };
export type SourceScope = {
  id: string; platform: ResearchSourcePlatform; url: string; scope: string;
  method: 'public_read' | 'local_authorized_summary'; contentScope: SourceContentScope;
  rights: SourceRights;
  /** Human-reviewed necessary summary; no model adapter or financial inference. */
  summary?: ResearchInboxItem;
  /** Binds a public summary to the exact bytes actually read, not just a URL. */
  summaryReadHash?: string;
  localRead?: { attemptedAt: string; outcome: 'read_success' | 'read_failed' | 'auth_required'
    | 'metadata_only' | 'missing_transcript'; errorCode?: string };
};
export type SourceControllerInput = { runId: string; scopes: SourceScope[]; priorItems?: ResearchInboxItem[] };
export type SourceReadObservation = {
  attemptedAt: string; completedAt: string; outcome: 'read_success' | 'read_failed' | 'not_attempted' | 'auth_required'
    | 'metadata_only' | 'missing_transcript'; httpStatus: number | null; bytes: number;
  responseHash: string | null; bodyPresent: boolean; publishedAt: string | null; errorCode: string | null;
};

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const SHA = /^[0-9a-f]{64}$/u;
const instant = (value: unknown): value is string => typeof value === 'string' && INSTANT.test(value) && Number.isFinite(Date.parse(value));
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function keys(value: object, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('source_controller_unknown_field');
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

/** Defense in depth for permitted summaries, not a complete DLP or rights detector. */
export function assertSourcePacketBoundary(value: unknown) {
  let nodes = 0;
  function visit(member: unknown, depth: number) {
    if (++nodes > 40_000 || depth > 16) throw new Error('source_controller_json_bound');
    if (member === null || typeof member === 'boolean') return;
    if (typeof member === 'number' && Number.isFinite(member)) return;
    if (typeof member === 'string') {
      if (member.length > 4096 || /\bBearer\s+\S{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b(?:password|api[_-]?key|access[_-]?token|cookie)\s*[:=]\s*\S+/iu.test(member))
        throw new Error('source_controller_secret_or_text_bound');
      return;
    }
    if (Array.isArray(member)) { member.forEach((entry) => visit(entry, depth + 1)); return; }
    if (!object(member) || ![Object.prototype, null].includes(Object.getPrototypeOf(member))) throw new Error('source_controller_non_json');
    for (const [key, entry] of Object.entries(member)) {
      if (/^(?:__proto__|prototype|constructor|cookie|cookies|headers|authorization|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth\.json|rawHtml|rawText|fullText)$/iu.test(key))
        throw new Error('source_controller_forbidden_field');
      visit(entry, depth + 1);
    }
  }
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > SOURCE_CONTROLLER_LIMITS.inputBytes) throw new Error('source_controller_json_bound');
}

/** Exact URL roundtrip rejects credential query keys rather than silently stripping them. */
export function sourceControllerUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('source_controller_url_rejected'); }
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || url.hash
    || raw !== url.toString() || sanitizePublicSourceUrl(raw) !== raw)
    throw new Error('source_controller_url_rejected');
  for (const [key,value] of url.searchParams) {
    if (!['v','id','articleid'].includes(key) || !/^[A-Za-z0-9_-]{1,100}$/u.test(value))
      throw new Error('source_controller_url_rejected');
  }
  return url;
}

const LOCAL_HOSTS: Record<ResearchSourcePlatform, readonly string[]> = {
  official: ['www.auo.com', 'auo.com', 'www.twse.com.tw', 'openapi.twse.com.tw', 'www.tpex.org.tw', 'mops.twse.com.tw'],
  news: ['news.cnyes.com', 'money.udn.com'], broker: ['news.cnyes.com'],
  ptt: ['www.ptt.cc'], investanchors: ['investanchors.com', 'www.investanchors.com'],
  threads: ['www.threads.net', 'www.threads.com', 'threads.net', 'threads.com'],
  instagram: ['www.instagram.com', 'instagram.com'], facebook: ['www.facebook.com', 'facebook.com'],
  podcast: ['feeds.soundon.fm', 'podcasts.apple.com'], youtube: ['www.youtube.com', 'youtube.com', 'youtu.be'],
  telegram: ['t.me'], bulltalk: ['www.cmoney.tw', 'www.bulltalk.tw'], twse_insider: ['www.twse.com.tw', 'openapi.twse.com.tw'],
};
export function sourceCitationAllowed(platform: ResearchSourcePlatform, raw: string) {
  return LOCAL_HOSTS[platform]?.includes(sourceControllerUrl(raw).hostname) === true;
}

/** Reviewed, finite public surfaces only. Not an origin supplied by the input/model. */
export function publicSourceGrant(scope: SourceScope) {
  const url = sourceControllerUrl(scope.url);
  if (scope.method !== 'public_read') return false;
  if (url.search) return false;
  if (scope.rights.basis === 'creator_published_index') return scope.platform === 'podcast'
    && (CREATOR_PUBLISHED_PODCAST_RSS_INDEX_ALLOWLIST as readonly string[]).includes(url.toString())
    && scope.contentScope === 'metadata_index';
  if (scope.rights.basis !== 'official_public_document' || scope.platform !== 'official') return false;
  if (url.hostname === 'www.auo.com') return /^\/(?:zh-TW|en-global)\/(?:News_Archive|Press_Release)(?:\/|$)/u.test(url.pathname)
    && (scope.contentScope === 'metadata_index' || scope.contentScope === 'article_body'
      && /^\/(?:zh-TW|en-global)\/(?:News_Archive|Press_Release)\/detail\/[^/]+$/u.test(url.pathname));
  if (url.hostname === 'openapi.twse.com.tw') return /^\/v1\/[A-Za-z0-9_/-]+$/u.test(url.pathname)
    && scope.contentScope === 'official_document';
  return false;
}

const ITEM_KEYS = ['sourcePlatform','sourceUrl','author','publishedAt','observedAt','symbols','shortSummary','catalyst','risk',
  'claimStatus','visibility','parentSourceUrl','contentForm','acquisitionMethod','timedExcerpts','firstObservedAt','revisionObservedAt','retracted'];
function checkedItem(item: ResearchInboxItem, asOf: string) {
  keys(item, ITEM_KEYS);
  if (item.timedExcerpts) item.timedExcerpts.forEach((entry) => keys(entry, ['startSeconds','endSeconds','text']));
  if (!validateResearchInboxItem(item) || !sourceCitationAllowed(item.sourcePlatform, item.sourceUrl)
    || item.symbols.some((symbol)=>typeof symbol!=='string')
    || [item.publishedAt,item.observedAt,item.firstObservedAt || item.observedAt,item.revisionObservedAt || item.observedAt]
      .some((at) => !instant(at) || Date.parse(at) > Date.parse(asOf))) throw new Error('source_controller_item_invalid_or_future');
  if (item.parentSourceUrl && !RESEARCH_SOURCE_PLATFORMS.some((platform) => sourceCitationAllowed(platform, item.parentSourceUrl!)))
    throw new Error('source_controller_parent_url_rejected');
  if (!item.contentForm || !item.acquisitionMethod) throw new Error('source_controller_content_scope_required');
}

export function validateSourceControllerInput(value: unknown, now: string): SourceControllerInput {
  assertSourcePacketBoundary(value);
  if (!object(value) || !instant(now)) throw new Error('source_controller_input_invalid');
  keys(value, ['runId','scopes','priorItems']);
  const input = value as unknown as SourceControllerInput;
  if (!uuid(input.runId) || !Array.isArray(input.scopes) || input.scopes.length < 1
    || input.scopes.length > SOURCE_CONTROLLER_LIMITS.scopes || input.priorItems !== undefined && !Array.isArray(input.priorItems)
    || (input.priorItems?.length || 0) > SOURCE_CONTROLLER_LIMITS.priorItems) throw new Error('source_controller_input_invalid');
  const identities = new Set<string>();
  for (const scope of input.scopes) {
    if (!object(scope)) throw new Error('source_controller_scope_invalid');
    keys(scope, ['id','platform','url','scope','method','contentScope','rights','summary','summaryReadHash','localRead']);
    if (!text(scope.id,80) || !/^[A-Za-z0-9_-]+$/u.test(scope.id) || identities.has(scope.id)
      || !(RESEARCH_SOURCE_PLATFORMS as readonly string[]).includes(scope.platform) || !text(scope.scope,300) || scope.scope.trim().length < 4
      || `${scope.id}: ${scope.scope} | ${scope.url}`.length > 500
      || !['public_read','local_authorized_summary'].includes(scope.method)
      || !['article_body','official_document','transcript','metadata_index'].includes(scope.contentScope)
      || !object(scope.rights)) throw new Error('source_controller_scope_invalid');
    identities.add(scope.id); keys(scope.rights, ['basis','checkedAt','checkedBy']);
    if (!['official_public_document','creator_published_index','authorized_local_summary'].includes(scope.rights.basis)
      || !instant(scope.rights.checkedAt) || Date.parse(scope.rights.checkedAt) > Date.parse(now) || !text(scope.rights.checkedBy,100))
      throw new Error('source_controller_rights_invalid');
    if (!sourceCitationAllowed(scope.platform,scope.url)) throw new Error('source_controller_source_not_reviewed');
    if (scope.summary !== undefined) {
      if (!object(scope.summary)) throw new Error('source_controller_summary_invalid');
      checkedItem(scope.summary,now);
      if (scope.summary.sourceUrl !== scope.url || scope.summary.sourcePlatform !== scope.platform)
        throw new Error('source_controller_summary_binding_invalid');
    }
    if (scope.method === 'public_read') {
      if (scope.localRead || !publicSourceGrant(scope)) throw new Error('source_controller_public_grant_missing');
      if (scope.summaryReadHash !== undefined && (!scope.summary || !SHA.test(scope.summaryReadHash)))
        throw new Error('source_controller_summary_binding_invalid');
      if (scope.summary && (!SHA.test(scope.summaryReadHash || '') || scope.summary.visibility !== 'public'
        || !['public_document','publisher_transcript'].includes(scope.summary.acquisitionMethod!)
        || scope.summary.contentForm !== (scope.contentScope==='transcript' ? 'transcript_excerpt' : 'research_summary')))
        throw new Error('source_controller_summary_binding_invalid');
    } else {
      if (scope.rights.basis !== 'authorized_local_summary' || !object(scope.localRead) || scope.summaryReadHash)
        throw new Error('source_controller_local_boundary_invalid');
      keys(scope.localRead, ['attemptedAt','outcome','errorCode']);
      if (!instant(scope.localRead.attemptedAt) || Date.parse(scope.localRead.attemptedAt) > Date.parse(now)
        || Date.parse(scope.localRead.attemptedAt) < Date.parse(now) - 35 * 3600_000
        || Date.parse(scope.rights.checkedAt) > Date.parse(scope.localRead.attemptedAt)
        || !['read_success','read_failed','auth_required','metadata_only','missing_transcript'].includes(scope.localRead.outcome)
        || scope.localRead.errorCode !== undefined && (typeof scope.localRead.errorCode!=='string' || !/^[a-z0-9_]{3,100}$/u.test(scope.localRead.errorCode)))
        throw new Error('source_controller_local_receipt_invalid');
      if (scope.summary && (scope.summary.visibility !== 'authenticated_summary'
        || scope.summary.acquisitionMethod !== 'authenticated_browser_summary'
        || scope.summary.contentForm !== 'research_summary')) throw new Error('source_controller_local_boundary_invalid');
    }
  }
  for (const item of input.priorItems || []) checkedItem(item,now);
  return input;
}

/** Never executes markup, follows links or creates an inferred research summary. */
export function inspectSourceBody(scope: SourceScope, body: string, contentType: string) {
  if (Buffer.byteLength(body) > SOURCE_CONTROLLER_LIMITS.bodyBytes) throw new Error('source_controller_body_bound');
  const responseHash = createHash('sha256').update(body).digest('hex');
  const withoutCode = body.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,'');
  const visible = withoutCode.replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ').trim();
  const html = /text\/html/iu.test(contentType);
  const article = /<article\b[^>]*>([\s\S]*?)<\/article\s*>/iu.exec(withoutCode);
  // The reviewed AUO detail template uses html-edit, not an article element.
  // Require both that exact detail route and its title/body markers; navigation
  // text, an index or an unrecognized template still cannot establish content.
  const auoDetail = scope.platform === 'official' && scope.url.startsWith('https://www.auo.com/')
    && /^\/(?:zh-TW|en-global)\/(?:News_Archive|Press_Release)\/detail\/[^/]+$/u.test(new URL(scope.url).pathname)
    && /<h1\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>[^<]+<\/h1>/iu.test(withoutCode)
    ? /<div\b[^>]*class=["']html-edit["'][^>]*>([\s\S]*?)<\/div\s*>/iu.exec(withoutCode) : null;
  const articleText = (article?.[1] || auoDetail?.[1] || '').replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ').trim();
  // RSS/JSON may legitimately contain episode titles or claims mentioning
  // login. Such words do not prove a provider authentication wall.
  if (html && (/<input\b[^>]*type\s*=\s*["']?password\b/iu.test(withoutCode)
    || articleText.length < 80 && /(?:login required|sign in to (?:continue|read)|會員限定|請先登入|登入後才能)/iu.test(visible)))
    return { responseHash, bodyPresent:false, publishedAt:null, outcome:'auth_required' as const };
  const publishedMatch = /<meta\b[^>]*(?:property|name)=["'](?:article:published_time|datePublished)["'][^>]*content=["']([^"']+)["']/iu.exec(withoutCode)
    || /<time\b[^>]*datetime=["']([^"']+)["']/iu.exec(withoutCode);
  const publishedAt = publishedMatch && instant(publishedMatch[1]) ? new Date(publishedMatch[1]).toISOString() : null;
  if (scope.contentScope === 'metadata_index') return {responseHash,bodyPresent:false,publishedAt,outcome:'metadata_only' as const};
  if (scope.url.startsWith('https://www.auo.com/') && scope.contentScope === 'article_body'
    && !/^\/(?:zh-TW|en-global)\/(?:News_Archive|Press_Release)\/detail\/[^/]+$/u.test(new URL(scope.url).pathname))
    return {responseHash,bodyPresent:false,publishedAt,outcome:'metadata_only' as const};
  if (scope.contentScope === 'transcript') return {responseHash,bodyPresent:false,publishedAt,outcome:'missing_transcript' as const};
  let bodyPresent = false;
  if (scope.contentScope === 'official_document' && /(?:application\/json|text\/csv)/iu.test(contentType)) {
    if (/application\/json/iu.test(contentType)) {
      try { const parsed: unknown = JSON.parse(body); bodyPresent = Array.isArray(parsed) && parsed.length > 0 && object(parsed[0]); } catch { /* Not a JSON document. */ }
    } else bodyPresent = visible.length > 80 && visible.includes(',');
  } else if (html) {
    bodyPresent = articleText.length >= 80;
  }
  return { responseHash,bodyPresent,publishedAt,outcome:bodyPresent ? 'read_success' as const : 'metadata_only' as const };
}

export function assembleSourceControllerRun(input: SourceControllerInput, observations: SourceReadObservation[], asOf: string) {
  validateSourceControllerInput(input,asOf);
  if (observations.length !== input.scopes.length) throw new Error('source_controller_observation_count');
  const prior = input.priorItems || [];
  const items: ResearchInboxItem[] = [];
  const knownHashes = new Set(prior.map(researchInboxContentHash));
  const receipts = input.scopes.map((scope,index) => {
    const observation = observations[index];
    if (!instant(observation.attemptedAt) || !instant(observation.completedAt)
      || Date.parse(observation.attemptedAt) > Date.parse(observation.completedAt) || Date.parse(observation.completedAt) > Date.parse(asOf)
      || Date.parse(observation.attemptedAt) < Date.parse(asOf) - 36 * 3600_000
      || !Number.isInteger(observation.bytes) || observation.bytes < 0 || observation.bytes > SOURCE_CONTROLLER_LIMITS.bodyBytes
      || observation.responseHash !== null && !SHA.test(observation.responseHash)
      || typeof observation.bodyPresent !== 'boolean'
      || observation.publishedAt !== null && !instant(observation.publishedAt)
      || observation.errorCode !== null && typeof observation.errorCode!=='string'
      || observation.httpStatus !== null && (!Number.isInteger(observation.httpStatus) || observation.httpStatus < 100 || observation.httpStatus > 599)
      || !['read_success','read_failed','not_attempted','auth_required','metadata_only','missing_transcript'].includes(observation.outcome))
      throw new Error('source_controller_observation_invalid');
    const deadlineSkip=observation.outcome==='not_attempted' && observation.errorCode==='source_run_deadline'
      && observation.httpStatus===null && observation.responseHash===null && observation.bytes===0
      && observation.bodyPresent===false && observation.publishedAt===null;
    if (scope.method==='local_authorized_summary' && !deadlineSkip && (observation.attemptedAt!==scope.localRead!.attemptedAt
      || observation.outcome!==scope.localRead!.outcome || observation.httpStatus!==null
      || observation.responseHash!==null || observation.bytes!==0)) throw new Error('source_controller_local_observation_mismatch');
    if (scope.method === 'public_read' && ['read_success','metadata_only','missing_transcript'].includes(observation.outcome)
      && (observation.httpStatus === null || observation.httpStatus < 200 || observation.httpStatus >= 300 || !observation.responseHash))
      throw new Error('source_controller_observation_invalid');
    let outcome: SourceOutcome = observation.outcome;
    let errorCode: string | null = observation.errorCode;
    let accepted: ResearchInboxItem | null = null;
    if (observation.publishedAt && (!instant(observation.publishedAt) || Date.parse(observation.publishedAt) > Date.parse(observation.attemptedAt))) {
      outcome='future_source'; errorCode='source_future_publication';
    } else if (outcome === 'read_success') {
      if (!observation.bodyPresent || scope.contentScope === 'metadata_index') { outcome='metadata_only'; errorCode='source_metadata_only'; }
      else if (!scope.summary) { outcome='awaiting_summary'; errorCode='source_awaiting_summary'; }
      else if (scope.method === 'public_read' && scope.summaryReadHash !== observation.responseHash) {
        outcome='read_failed'; errorCode='source_summary_read_hash_mismatch';
      } else if (scope.method === 'public_read' && observation.publishedAt !== null
        && Date.parse(scope.summary.publishedAt) !== Date.parse(observation.publishedAt)) {
        // Exact bytes alone cannot certify a supplied earlier publication time.
        // Keep both clocks visible and reject rather than backdate the root.
        outcome='read_failed'; errorCode='source_summary_publication_conflict';
      } else {
        const summary=scope.summary;
        if (Date.parse(summary.observedAt) > Date.parse(observation.attemptedAt)
          || Date.parse(summary.publishedAt) > Date.parse(observation.attemptedAt)) throw new Error('source_controller_future_summary');
        // Retain original discovery time across edits and reposts. No new root
        // is inferred merely from a different publisher URL.
        let parent = summary.parentSourceUrl || null;
        const visited = new Set([summary.sourceUrl]);
        while (parent) {
          if (visited.has(parent)) throw new Error('source_controller_parent_cycle');
          visited.add(parent);
          // Unaccepted scope summaries have no acquisition authority. Among
          // retained/accepted revisions use the latest revision clock, never
          // input order; conflicting heads at the same instant fail closed.
          const ancestors=[...prior,...items].filter((item)=>item.sourceUrl===parent);
          const latest=Math.max(...ancestors.map((item)=>Date.parse(item.revisionObservedAt || item.observedAt)));
          const heads=ancestors.filter((item)=>Date.parse(item.revisionObservedAt || item.observedAt)===latest);
          if (new Set(heads.map(researchInboxContentHash)).size>1) throw new Error('source_controller_ancestor_revision_conflict');
          const ancestor=heads[0];
          if (!ancestor?.parentSourceUrl) break;
          parent=ancestor.parentSourceUrl;
        }
        const previous=[...prior,...items].filter((item)=>item.sourceUrl===summary.sourceUrl);
        const first=[summary.firstObservedAt || summary.observedAt,...previous.map((item)=>item.firstObservedAt || item.observedAt)]
          .sort((a,b)=>Date.parse(a)-Date.parse(b))[0];
        accepted={...summary,parentSourceUrl:parent,firstObservedAt:first,
          revisionObservedAt:summary.revisionObservedAt || summary.observedAt};
        checkedItem(accepted,asOf);
        const hash=researchInboxContentHash(accepted);
        if (knownHashes.has(hash)) outcome='duplicate';
        else { outcome='item_ready'; knownHashes.add(hash); items.push(accepted); }
        errorCode=null;
      }
    }
    const success=outcome==='item_ready' || outcome==='duplicate';
    if (!success && !errorCode) errorCode=`source_${outcome}`;
    // Do not export upstream exceptions, HTML, headers or raw authenticated text.
    if (errorCode && !/^[a-z0-9_]{3,100}$/u.test(errorCode)) errorCode='source_read_failed';
    const receipt={ policyVersion:SOURCE_CONTROLLER_POLICY,runId:input.runId,scopeId:scope.id,
      platform:scope.platform,sourceUrl:scope.url,scope:scope.scope,method:scope.method,contentScope:scope.contentScope,
      rights:scope.rights,attemptedAt:observation.attemptedAt,completedAt:observation.completedAt,
      readOutcome:observation.outcome,outcome,httpStatus:observation.httpStatus,bytes:observation.bytes,
      readAttempted:observation.outcome!=='not_attempted',
      bodyPresent:observation.bodyPresent,responseHash:observation.responseHash,
      publishedAt:accepted?.publishedAt || observation.publishedAt,
      sourcePublishedAt:observation.publishedAt,summaryPublishedAt:scope.summary?.publishedAt || null,
      firstObservedAt:accepted?.firstObservedAt || null,revisionObservedAt:accepted?.revisionObservedAt || null,
      rootUrl:accepted?.parentSourceUrl || accepted?.sourceUrl || null,
      contentHash:accepted ? researchInboxContentHash(accepted) : null,
      retracted:accepted?.retracted || false,errorCode,
      legacyConnectorDisposition:(SOURCE_CONNECTOR_KEYS as readonly string[]).includes(scope.platform)
        ? sourceExecutionPolicy(scope.platform).disposition : null,
      platformEnabled:false as const,
    };
    const receiptHash=researchCanonicalHash(receipt);
    const attempt: ResearchSourceAttempt={platform:scope.platform,status:outcome==='not_attempted' ? 'not_attempted' : success ? 'success' : 'failed',
      attemptedAt:observation.attemptedAt,scope:`${scope.id}: ${scope.scope} | ${scope.url}`,
      resultCount:success ? outcome==='item_ready' ? 1 : 0 : null,errorCode:success || outcome==='not_attempted' ? null : errorCode,receiptHash};
    return {...receipt,receiptHash,attempt};
  });
  const roots=[...prior,...items].map((item)=>researchRootFromDocument(buildResearchInboxRow(item),asOf)).filter((root)=>root!==null);
  return {policyVersion:SOURCE_CONTROLLER_POLICY,runId:input.runId,asOf,
    limits:SOURCE_CONTROLLER_LIMITS,receipts,
    unattemptedPlatforms:RESEARCH_SOURCE_PLATFORMS.filter((platform)=>!input.scopes.some((scope)=>scope.platform===platform)),
    priorityRequest:{asOf,sourceAttempts:receipts.map((receipt)=>receipt.attempt)},
    inboxRequest:{items},roots,priorItemsUnchanged:true,
    limitations:['Exact supplied scopes only; no exhaustive search or platform activation.',
      'No summary/model adapter, authenticated browser dispatcher, submission, publication or strategy approval.',
      'Prior items are controller-retained context; authoritative heads remain in VPS.'],
    authoritativePublication:false,strategyApproved:false};
}

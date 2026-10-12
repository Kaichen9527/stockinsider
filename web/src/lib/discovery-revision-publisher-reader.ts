import { canonicalJson, sha256Canonical } from './opportunity-v3/canonical.ts';

/** Read-only columns from the existing v3 relations; no raw text is projected. */
type Clock = string;
export type Revision = {
  revision_id: string; revision_family_key: string; source_key: string;
  source_identity_authority_id: string; approved_source_identity_id: string;
  stable_connector_document_id: string; published_at: Clock | null; collected_at: Clock;
  recorded_at: Clock; acquisition_status: string; adapter_version: string;
  ingestion_canonical_content_hash_v3: string | null;
};
export type SourceAuthority = {
  authority_id: string; source_identity_id: string; source_key: string; source_class: string;
  distribution_identity: string; valid_from: Clock; valid_to: Clock | null;
  status: string; approved_at: Clock; approving_principal_id: string; recorded_at: Clock;
};
export type PublisherAuthority = {
  authority_id: string; publisher_identity_id: string; source_class: string; domains: string[];
  feed_identity: string | null; institution_identity: string | null; valid_from: Clock;
  valid_to: Clock | null; approved_at: Clock; approving_principal_id: string;
  status: string; recorded_at: Clock;
};
export type Verification = {
  verification_id: string; source_run_id: string; source_cutoff: Clock; revision_id: string;
  publisher_manifest_id: string; publisher_identity_id: string; institution_identity: string | null;
  canonical_document_id: string; canonical_content_hash: string; published_at: Clock | null;
  collected_at: Clock; evidence_ref: string; recorded_at: Clock;
};
type Registry = { source_key: string; revision_family_key: string; approved_source_identity_id: string;
  stable_connector_document_id: string; registered_at: Clock };
type Manifest = { manifest_id: string; manifest_kind: string; contract_version: string;
  source_cutoff: Clock; status: string; row_count: number; root_json: unknown;
  manifest_hash: string; recorded_at: Clock; terminal_at: Clock };
type ManifestRow = { manifest_id: string; section_key: string; row_ordinal: number;
  identity_key: string; terminal_code: string; payload_json: unknown; payload_hash: string; recorded_at: Clock };
export type ReaderTables = {
  revisions: Revision[]; sourceAuthorities: SourceAuthority[]; publishers: PublisherAuthority[];
  verifications: Verification[]; registry: Registry[]; manifests: Manifest[]; manifestRows: ManifestRow[];
};
export type CountedSnapshot = {
  run_id: string; source_cutoff: Clock;
  /** Counts must come from the same frozen read snapshot, not page lengths. */
  tables: { [K in keyof ReaderTables]: { exact_count: number; projection_sha256: string } };
};
export type ReaderInput = {
  run: { run_id: string; source_cutoff: Clock; status: string; sealed_at: Clock | null };
  snapshot_at: Clock; publisher_manifest_input: { run_id: string; manifest_id: string;
    input_role: string; ordinal: number; recorded_at: Clock };
  population: CountedSnapshot; tables: ReaderTables;
  /** No approved raw UUID -> normalized revision bridge exists in this base. */
  legacy_raw_document_ids?: string[];
};
const TABLES = ['revisions', 'sourceAuthorities', 'publishers', 'verifications', 'registry',
  'manifests', 'manifestRows'] as const;
export const DISCOVERY_READER_BOUNDS = Object.freeze({ perTableRows: 4096, totalRows: 16384,
  serializedBytes: 4194304, perStreamRows: 64, outputBindings: 1000 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** PostgreSQL microseconds retained, explicit offset required, no millisecond truncation. */
export function discoveryClock(value: string): bigint {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!m || Number(m[2].slice(0, 2)) > 23 || Number(m[2].slice(3, 5)) > 59 || Number(m[2].slice(6)) > 59) throw Error('invalid_clock');
  const day = new Date(`${m[1]}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== m[1]) throw Error('invalid_clock');
  if (m[4] !== 'Z' && (Number(m[4].slice(1, 3)) > 23 || Number(m[4].slice(4)) > 59)) throw Error('invalid_clock');
  const ms = Date.parse(`${m[1]}T${m[2]}${m[4]}`);
  if (!Number.isFinite(ms)) throw Error('invalid_clock');
  return BigInt(ms) * BigInt(1000) + BigInt((m[3] ?? '').padEnd(6, '0'));
}
export function discoveryPopulationHash(rows: unknown[]): string {
  return sha256Canonical(rows.map(canonicalJson).sort(lexical));
}
// Preflight avoids serializing arbitrary nested/huge caller data before enforcing byte bounds.
function boundedShape(value: unknown, state = { nodes: 0, bytes: 0 }, depth = 0): void {
  if (++state.nodes > 200000 || depth > 12) throw Error('input_bound');
  if (typeof value === 'string') {
    if (value.length > DISCOVERY_READER_BOUNDS.serializedBytes) throw Error('input_bound');
    state.bytes += Buffer.byteLength(value);
  } else if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value) ? value : Object.values(value);
    if (entries.length > DISCOVERY_READER_BOUNDS.totalRows) throw Error('input_bound');
    for (const item of entries) boundedShape(item, state, depth + 1);
  } else if (!['number', 'boolean'].includes(typeof value) && value !== null) throw Error('invalid_shape');
  if (state.bytes > DISCOVERY_READER_BOUNDS.serializedBytes) throw Error('input_bound');
}
function before(value: Clock, end: bigint) { return discoveryClock(value) <= end; }
function authorityKnown(row: SourceAuthority | PublisherAuthority, cutoff: bigint) {
  if (!['official', 'public_research', 'curated_thesis', 'community'].includes(row.source_class) ||
    !UUID.test(row.authority_id) || !UUID.test(row.approving_principal_id) ||
    ('source_identity_id' in row && !UUID.test(row.source_identity_id)) ||
    ('publisher_identity_id' in row && (!UUID.test(row.publisher_identity_id) ||
      (row.source_class === 'public_research' && row.institution_identity === null) ||
      !Array.isArray(row.domains) || row.domains.length > 64 || row.domains.some(d => typeof d !== 'string' || d.length > 253))) ||
    !['active', 'inactive'].includes(row.status) || discoveryClock(row.approved_at) > discoveryClock(row.recorded_at) ||
    (row.valid_to !== null && discoveryClock(row.valid_to) <= discoveryClock(row.valid_from))) throw Error('invalid_authority');
  return before(row.recorded_at, cutoff) && before(row.approved_at, cutoff) && before(row.valid_from, cutoff);
}
function active(row: SourceAuthority | PublisherAuthority, cutoff: bigint) {
  return row.status === 'active' && (row.valid_to === null || discoveryClock(row.valid_to) > cutoff);
}
function head<T extends { recorded_at: Clock }>(rows: T[]): T | null {
  if (rows.length > DISCOVERY_READER_BOUNDS.perStreamRows) throw Error('stream_bound');
  const sorted = [...rows].sort((a, b) => discoveryClock(a.recorded_at) > discoveryClock(b.recorded_at) ? -1 :
    discoveryClock(a.recorded_at) < discoveryClock(b.recorded_at) ? 1 : lexical(canonicalJson(a), canonicalJson(b)));
  if (!sorted.length) return null;
  const top = sorted.filter(r => discoveryClock(r.recorded_at) === discoveryClock(sorted[0].recorded_at));
  // Conservative ambiguity includes different IDs; never UUID-tiebreak into approval.
  if (new Set(top.map(canonicalJson)).size > 1) throw Error('contradictory_head');
  return sorted[0];
}
function publisherNative(p: PublisherAuthority) {
  return [p.authority_id, p.publisher_identity_id, p.source_class, p.domains, p.feed_identity,
    p.institution_identity, p.valid_from, p.valid_to, p.approved_at, p.approving_principal_id,
    p.status, p.recorded_at];
}
export function readDiscoveryRevisionPublishers(input: ReaderInput) {
  const dispositions: { table: string; identity: string; input_hash: string; disposition: string }[] = [];
  const bindings: { revision_id: string; publisher_identity_id: string; publisher_authority_id: string;
    verification_id: string; publisher_manifest_id: string; canonical_document_id: string;
    canonical_content_hash: string; published_at: string | null; collected_at: string;
    independent_news_root: null; cross_platform_creator: null }[] = [];
  const finish = (reason: string | null) => {
    const body = { version: 'discovery-revision-publisher-read-v1', run_id: input.run.run_id,
      source_cutoff: input.run.source_cutoff, status: reason ? 'unsupported' : 'projected', reason,
      // This pure helper checks a counted input packet, not live DB count/approval authenticity.
      live_population_verified: false, investment_admission: false, independent_origin_verified: false,
      bindings: reason ? [] : bindings, dispositions: dispositions.sort((a, b) => lexical(canonicalJson(a), canonicalJson(b))),
      accounting: { input_rows: TABLES.reduce((n,t) => n + input.tables[t].length, 0),
        terminal_rows: TABLES.reduce((n,t) => n + input.tables[t].length, 0),
        bound_deferred: reason === 'input_bound' ? TABLES.reduce((n,t) => n + input.tables[t].length, 0) : 0,
        aggregate_deferred_uninspected: reason ? TABLES.reduce((n,t) => n + input.tables[t].length, 0) - dispositions.length : 0,
        supplied_table_counts: Object.fromEntries(TABLES.map(t => [t, input.tables[t].length])) } };
    return { ...body, projection_hash: sha256Canonical(body) };
  };
  try {
    boundedShape(input);
    const cutoff = discoveryClock(input.run.source_cutoff), snapshot = discoveryClock(input.snapshot_at);
    let total = 0;
    for (const table of TABLES) {
      const rows = input.tables[table];
      if (!Array.isArray(rows)) throw Error('missing_population');
      total += rows.length;
      for (const row of rows) dispositions.push({ table, identity: sha256Canonical(row), input_hash: sha256Canonical(row), disposition: 'accounted_support' });
    }
    if (TABLES.some(t => input.tables[t].length > DISCOVERY_READER_BOUNDS.perTableRows) ||
      total > DISCOVERY_READER_BOUNDS.totalRows || Buffer.byteLength(canonicalJson(input)) > DISCOVERY_READER_BOUNDS.serializedBytes) throw Error('input_bound');
    if (!UUID.test(input.run.run_id) || input.run.status !== 'success' || !input.run.sealed_at ||
      !before(input.run.sealed_at, snapshot) || cutoff > snapshot) throw Error('run_not_frozen');
    if (input.population.run_id !== input.run.run_id || discoveryClock(input.population.source_cutoff) !== cutoff) throw Error('population_run_cutoff_mismatch');
    for (const t of TABLES) {
      const receipt = input.population.tables[t];
      if (!receipt || !Number.isSafeInteger(receipt.exact_count) || receipt.exact_count !== input.tables[t].length ||
        !HASH.test(receipt.projection_sha256) || receipt.projection_sha256 !== discoveryPopulationHash(input.tables[t])) throw Error('population_incomplete');
    }
    if ((input.legacy_raw_document_ids?.length ?? 0) > 0) throw Error('legacy_raw_revision_mapping_unavailable');
    const { tables: t, publisher_manifest_input: mi } = input;
    if (mi.run_id !== input.run.run_id || mi.input_role !== 'publisher_verification_allowlist' || mi.ordinal !== 0 || !before(mi.recorded_at, snapshot)) throw Error('manifest_run_binding_mismatch');
    const manifests = t.manifests.filter(m => m.manifest_id === mi.manifest_id);
    if (manifests.length !== 1 || t.manifests.length !== 1) throw Error('manifest_missing_or_ambiguous');
    const m = manifests[0], root = m.root_json;
    if (m.status !== 'complete' || m.manifest_kind !== mi.input_role || m.contract_version !== 'source-publisher-allowlist-v3.0' ||
      discoveryClock(m.source_cutoff) !== cutoff || !before(m.recorded_at, snapshot) || !before(m.terminal_at, snapshot) ||
      !Array.isArray(root) || root.length !== 6 || root[0] !== 'opportunity-manifest-root-v3.3' || root[1] !== m.manifest_kind ||
      root[2] !== m.contract_version || typeof root[3] !== 'string' || discoveryClock(root[3]) !== cutoff ||
      !HASH.test(m.manifest_hash) || sha256Canonical(root) !== m.manifest_hash) throw Error('manifest_integrity_mismatch');
    const manifestRows = t.manifestRows.filter(r => r.manifest_id === m.manifest_id).sort((a, b) => a.row_ordinal - b.row_ordinal);
    if (t.manifestRows.length !== manifestRows.length || !Number.isSafeInteger(m.row_count) || m.row_count !== manifestRows.length || manifestRows.some((r, i) => r.row_ordinal !== i ||
      r.section_key !== 'rows' || r.payload_hash !== sha256Canonical(r.payload_json) || !before(r.recorded_at, snapshot))) throw Error('manifest_rows_incomplete');
    // Rebuild the actual v3.3 page and row identity chain from the retained root descriptors.
    const header = root[4];
    if (!Array.isArray(header) || canonicalJson(header) !== canonicalJson([['rowCount', m.row_count], ['sourceCutoff', m.source_cutoff]])) throw Error('manifest_header_mismatch');
    const sections = root[5];
    if (!Array.isArray(sections) || sections.length !== 1 || !Array.isArray(sections[0]) ||
      sections[0].length !== 3 || sections[0][0] !== 'rows' || sections[0][1] !== m.row_count ||
      !Array.isArray(sections[0][2])) throw Error('manifest_page_chain_mismatch');
    let consumed = 0;
    for (const [ordinal, descriptor] of sections[0][2].entries()) {
      if (!Array.isArray(descriptor) || descriptor.length !== 6 || descriptor[0] !== ordinal || descriptor[1] !== consumed ||
        !Number.isSafeInteger(descriptor[2]) || descriptor[2] < 1 || descriptor[2] > 2000) throw Error('manifest_page_chain_mismatch');
      const rows = manifestRows.slice(consumed, consumed + descriptor[2]);
      if (rows.length !== descriptor[2] || descriptor[3] !== rows[0].identity_key || descriptor[4] !== rows.at(-1)!.identity_key ||
        rows.some(r => r.identity_key !== sha256Canonical(['opportunity-manifest-row-identity-v3.3', m.manifest_kind, 'rows', r.row_ordinal, r.payload_hash]))) throw Error('manifest_page_chain_mismatch');
      const page = ['opportunity-manifest-page-v3.3', m.manifest_kind, m.contract_version, m.source_cutoff,
        'rows', ordinal, consumed, rows.map(r => [r.row_ordinal, r.identity_key, r.terminal_code, r.payload_json])];
      if (descriptor[5] !== sha256Canonical(page)) throw Error('manifest_page_chain_mismatch');
      consumed += rows.length;
    }
    if (consumed !== m.row_count) throw Error('manifest_page_chain_mismatch');
    // Validate clocks before head/dedup identity selection. Future rows do not pollute known IDs.
    const knownSources = t.sourceAuthorities.filter(r => authorityKnown(r, cutoff));
    const knownPublishers = t.publishers.filter(r => authorityKnown(r, cutoff));
    // Knowledge is collection/recording. A known invalid publication must remain a head candidate.
    const knownRevisions = t.revisions.filter(r => before(r.recorded_at, cutoff) && before(r.collected_at, cutoff));
    for (const [table, rows] of [['revisions', knownRevisions], ['sourceAuthorities', knownSources],
      ['publishers', knownPublishers], ['verifications', t.verifications]] as const) {
      const identities = new Map<string, string>();
      for (const row of rows) {
        const r = row as unknown as Record<string, unknown>;
        const key = String(table === 'revisions' ? r.revision_id : r.authority_id ?? r.verification_id), bytes = canonicalJson(row);
        if (!UUID.test(key) || (identities.has(key) && identities.get(key) !== bytes)) throw Error('conflicting_row_identity');
        identities.set(key, bytes);
      }
    }
    const group = <T,>(rows: T[], key: (r: T) => string) => {
      const map = new Map<string, T[]>();
      for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
      return map;
    };
    const sourceHeads = new Map([...group(knownSources, r => r.source_identity_id)].map(([k, rows]) => [k, head(rows)]));
    const publisherHeads = new Map([...group(knownPublishers, r => r.publisher_identity_id)].map(([k, rows]) => [k, head(rows)]));
    for (const row of manifestRows) {
      const native = row.payload_json;
      if (!Array.isArray(native) || native.length !== 12 || typeof native[1] !== 'string') throw Error('publisher_manifest_binding_mismatch');
      const p = publisherHeads.get(native[1]);
      if (!p || row.terminal_code !== (active(p, cutoff) ? 'effective_active' : 'revoked_or_expired')) throw Error('publisher_manifest_terminal_mismatch');
    }
    const expectedPublisherRows = [...publisherHeads.values()].map(p => publisherNative(p!)).map(canonicalJson).sort(lexical);
    if (canonicalJson(manifestRows.map(r => canonicalJson(r.payload_json)).sort(lexical)) !== canonicalJson(expectedPublisherRows)) throw Error('publisher_manifest_binding_mismatch');
    for (const [, rows] of [...group(knownRevisions, r => `${r.source_key}:${r.revision_family_key}`)].sort(([a], [b]) => lexical(a, b))) {
      const r = head(rows)!;
      if (!HASH.test(r.revision_family_key) || !UUID.test(r.approved_source_identity_id) ||
        !['complete','invalid_utf8','required_field_missing','content_overflow'].includes(r.acquisition_status)) throw Error('invalid_revision');
      let disposition = 'selected_no_publisher_binding';
      const mark = () => { for (const d of dispositions.filter(d => d.table === 'revisions' && d.input_hash === sha256Canonical(r))) d.disposition = disposition; };
      if (r.acquisition_status !== 'complete') { disposition = 'latest_revision_not_complete'; mark(); continue; }
      let publicationInvalid = false;
      try {
        publicationInvalid = r.published_at !== null && (discoveryClock(r.published_at) > cutoff ||
          discoveryClock(r.published_at) > discoveryClock(r.collected_at));
      } catch { publicationInvalid = true; }
      if (publicationInvalid) { disposition = 'latest_revision_publication_invalid'; mark(); continue; }

      const sa = sourceHeads.get(r.approved_source_identity_id);
      if (!sa || !active(sa, cutoff) || sa.authority_id !== r.source_identity_authority_id || sa.source_key !== r.source_key) { disposition = 'source_authority_not_effective'; mark(); continue; }
      const registry = t.registry.filter(x => x.source_key === r.source_key && x.revision_family_key === r.revision_family_key);
      if (registry.length !== 1 || !before(registry[0].registered_at, cutoff) || registry[0].approved_source_identity_id !== r.approved_source_identity_id ||
        registry[0].stable_connector_document_id !== r.stable_connector_document_id || r.adapter_version !== 'source-adapter-v3.3' ||
        !r.ingestion_canonical_content_hash_v3 || !HASH.test(r.ingestion_canonical_content_hash_v3) ||
        discoveryClock(r.collected_at) > discoveryClock(r.recorded_at) || (r.published_at !== null && discoveryClock(r.published_at) > discoveryClock(r.collected_at))) throw Error('revision_registry_mismatch');
      const v = t.verifications.filter(v => v.revision_id === r.revision_id);
      if (v.length !== 1) { disposition = 'verification_missing_or_ambiguous'; mark(); continue; }
      const verification = v[0];
      if (verification.source_run_id !== input.run.run_id || discoveryClock(verification.source_cutoff) !== cutoff ||
        verification.publisher_manifest_id !== mi.manifest_id || !before(verification.recorded_at, snapshot) ||
        discoveryClock(verification.collected_at) !== discoveryClock(r.collected_at) ||
        (verification.published_at === null ? r.published_at !== null : r.published_at === null || discoveryClock(verification.published_at) !== discoveryClock(r.published_at)) ||
        verification.canonical_content_hash !== r.ingestion_canonical_content_hash_v3 || !verification.canonical_document_id ||
        !verification.evidence_ref || verification.evidence_ref.length > 120) throw Error('verification_revision_mismatch');
      const p = publisherHeads.get(verification.publisher_identity_id);
      if (!p || !active(p, cutoff)) { disposition = 'publisher_authority_not_effective'; mark(); continue; }
      if (p.institution_identity !== verification.institution_identity || !manifestRows.some(row => canonicalJson(row.payload_json) === canonicalJson(publisherNative(p)))) throw Error('publisher_manifest_binding_mismatch');
      if (bindings.length >= DISCOVERY_READER_BOUNDS.outputBindings) throw Error('output_bound');
      bindings.push({ revision_id: r.revision_id, publisher_identity_id: p.publisher_identity_id,
        publisher_authority_id: p.authority_id, verification_id: verification.verification_id,
        publisher_manifest_id: mi.manifest_id, canonical_document_id: verification.canonical_document_id,
        canonical_content_hash: verification.canonical_content_hash, published_at: r.published_at,
        collected_at: r.collected_at, independent_news_root: null, cross_platform_creator: null });
      disposition = 'publisher_bound_only'; mark();
    }
    for (const [table, known] of [['sourceAuthorities', knownSources], ['publishers', knownPublishers]] as const) {
      const knownHashes = new Set(known.map(sha256Canonical));
      for (const d of dispositions.filter(d => d.table === table)) if (!knownHashes.has(d.input_hash)) d.disposition = 'after_cutoff';
    }
    for (const d of dispositions.filter(d => d.table === 'revisions')) {
      const r = t.revisions.find(r => sha256Canonical(r) === d.input_hash)!;
      if (!knownRevisions.includes(r)) d.disposition = 'after_cutoff';
      else if (d.disposition === 'accounted_support') d.disposition = 'superseded_revision';
    }
    return finish(null);
  } catch (error) {
    for (const d of dispositions) d.disposition = 'deferred_packet_rejected';
    return finish(error instanceof Error ? error.message : 'invalid_packet');
  }
}

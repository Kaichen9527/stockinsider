'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { canonicalJson, sha256, invariant } = require('./codec');
const { resolveCredentialReference } = require('./credential-resolver');
const approvedSourceRoster = require('../../config/runtime/approved-source-roster-v3.13.json');

const RUNNER_PRINCIPAL_ID = 'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001';
const SOURCE_REVIEWER_PRINCIPAL_ID = 'a11d4e67-7d0a-4c44-8a9d-1d5c3b875002';
const TWSE_ROSTER_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
const TPEX_ROSTER_URL = 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O';
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA64 = /^[0-9a-f]{64}$/u;
const RFC3339_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

const SOURCE_MAP = Object.freeze({
  broker_report: Object.freeze({ sourceKey: 'public_broker_research', sourceClass: 'public_research' }),
  bulltalk: Object.freeze({ sourceKey: 'bulltalk', sourceClass: 'community' }),
  instagram: Object.freeze({ sourceKey: 'instagram', sourceClass: 'community' }),
  investanchors: Object.freeze({ sourceKey: 'investanchors', sourceClass: 'curated_thesis' }),
  podcast: Object.freeze({ sourceKey: 'podcast', sourceClass: 'curated_thesis' }),
  ptt: Object.freeze({ sourceKey: 'ptt', sourceClass: 'community' }),
  telegram: Object.freeze({ sourceKey: 'telegram', sourceClass: 'community' }),
  threads: Object.freeze({ sourceKey: 'threads', sourceClass: 'community' }),
  youtube: Object.freeze({ sourceKey: 'youtube', sourceClass: 'curated_thesis' }),
});

const SECTOR_MAP = Object.freeze({
  '01': 'cement', '02': 'food', '03': 'plastics', '04': 'textile', '05': 'electrical_machinery',
  '06': 'electrical_cable', '08': 'glass_ceramic', '09': 'paper_pulp', '10': 'steel', '11': 'rubber',
  '12': 'auto', '14': 'construction', '15': 'shipping_transport', '16': 'tourism',
  '17': 'finance_insurance', '18': 'department_store', '20': 'other', '21': 'chemical',
  '22': 'biotech_medical', '23': 'oil_gas_electricity', '24': 'semiconductor',
  '25': 'computer_peripheral', '26': 'optoelectronics', '27': 'communications_network',
  '28': 'electronic_components', '29': 'electronic_distribution', '30': 'information_service',
  '31': 'other_electronics', '32': 'green_energy_environment', '33': 'digital_cloud',
  '34': 'sports_leisure', '35': 'home_living',
});

function exactObject(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
}

function validateBootstrapAuthority(authority, { sourceCommit, attestationCommit }, now = new Date(),
  resolver = resolveCredentialReference) {
  const keys = ['approvedAt','approvedBy','attestationCommit','commitSha','expiresAt','mutation','nonce','schema','signature'];
  invariant(exactObject(authority, keys), 'production_authority_bootstrap_required');
  invariant(authority.schema === 'stockinsider-production-authority-bootstrap-v1' &&
    authority.approvedBy === 'repository-owner' && authority.mutation === 'production_authority_bootstrap' &&
    authority.commitSha === sourceCommit && authority.attestationCommit === attestationCommit &&
    SHA64.test(authority.signature) && /^[0-9a-f]{32}$/u.test(authority.nonce) &&
    RFC3339_SECONDS.test(authority.approvedAt) && RFC3339_SECONDS.test(authority.expiresAt),
  'production_authority_bootstrap_required');
  const approved = Date.parse(authority.approvedAt); const expires = Date.parse(authority.expiresAt);
  invariant(Number.isFinite(approved) && Number.isFinite(expires) && approved <= now.getTime() &&
    now.getTime() <= expires && expires - approved <= 15 * 60 * 1000, 'production_authority_bootstrap_required');
  const unsigned = { ...authority }; delete unsigned.signature;
  const key = resolver('keychain:stockinsider-runtime:activation-authority-hmac');
  const expected = crypto.createHmac('sha256', key).update(canonicalJson(unsigned), 'utf8').digest('hex');
  invariant(crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(authority.signature, 'hex')),
    'production_authority_bootstrap_required');
  return authority;
}

function consumeBootstrapNonce(runtimeRoot, authority) {
  const ledger = path.join(runtimeRoot, 'production-authority-bootstrap-nonces');
  fs.mkdirSync(ledger, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(ledger);
  invariant(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() &&
    (stat.mode & 0o077) === 0, 'production_authority_bootstrap_required');
  const filename = path.join(ledger, authority.nonce);
  let descriptor;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY |
      fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(descriptor, `${sha256(canonicalJson(authority))}\n`);
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (error?.code === 'EEXIST' || error?.code === 'ELOOP') throw new Error('production_authority_bootstrap_required');
    throw error;
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function uuidFromIdentity(identity) {
  const bytes = crypto.createHash('sha256').update(identity, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function rocDateToIso(value) {
  invariant(/^\d{7}$/u.test(value), 'official roster date');
  const year = Number(value.slice(0, 3)) + 1911;
  const month = value.slice(3, 5); const day = value.slice(5, 7);
  const iso = `${year}-${month}-${day}T00:00:00Z`;
  invariant(!Number.isNaN(Date.parse(iso)), 'official roster date');
  return iso;
}

function ymdToIso(value) {
  invariant(/^\d{8}$/u.test(value), 'official listing date');
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`;
  invariant(!Number.isNaN(Date.parse(iso)), 'official listing date');
  return iso;
}

function normalizeOfficialRoster(twseRows, tpexRows) {
  invariant(Array.isArray(twseRows) && twseRows.length >= 900, 'TWSE official roster underfilled');
  invariant(Array.isArray(tpexRows) && tpexRows.length >= 700, 'TPEx official roster underfilled');
  const mapped = [
    ...twseRows.map((row) => ({ exchange: 'TWSE', provider: 'twse', symbol: row['公司代號'],
      legalName: row['公司名稱'], shortName: row['公司簡稱'], industryCode: row['產業別'],
      sourceTimestamp: rocDateToIso(row['出表日期']), validFrom: ymdToIso(row['上市日期']) })),
    ...tpexRows.map((row) => ({ exchange: 'TPEX', provider: 'tpex', symbol: row.SecuritiesCompanyCode,
      legalName: row.CompanyName, shortName: row.CompanyAbbreviation, industryCode: row.SecuritiesIndustryCode,
      sourceTimestamp: rocDateToIso(row.Date), validFrom: ymdToIso(row.DateOfListing) })),
  ].filter((row) => /^\d{4}$/u.test(String(row.symbol ?? '').trim()));
  const bySymbol = new Map();
  for (const input of mapped) {
    const row = { ...input, symbol: String(input.symbol).trim(), legalName: String(input.legalName ?? '').trim(),
      shortName: String(input.shortName ?? '').trim(), industryCode: String(input.industryCode ?? '').padStart(2, '0') };
    invariant(row.legalName.length >= 2 && row.shortName.length >= 2, 'official roster name');
    invariant(!bySymbol.has(row.symbol), `duplicate official symbol ${row.symbol}`);
    bySymbol.set(row.symbol, row);
  }
  invariant(bySymbol.size >= 1700, 'official common-stock roster underfilled');
  return [...bySymbol.values()].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

async function fetchOfficialRoster(fetchImpl = globalThis.fetch) {
  const fetchJson = async (url) => {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'StockInsider/3.11' },
      signal: AbortSignal.timeout(30000) });
    invariant(response.ok, `official roster unavailable: ${response.status}`);
    return response.json();
  };
  const [twse, tpex] = await Promise.all([fetchJson(TWSE_ROSTER_URL), fetchJson(TPEX_ROSTER_URL)]);
  return normalizeOfficialRoster(twse, tpex);
}

function normalizeField(value) {
  const text = String(value ?? '');
  return (text.startsWith('\uFEFF') ? text.slice(1) : text).replace(/\r\n/gu, '\n').replace(/\r/gu, '\n').normalize('NFKC');
}

function prepareLegacyDocument(row, identityAuthorityId) {
  const mapping = SOURCE_MAP[row.platform];
  invariant(mapping, 'unsupported legacy source platform');
  invariant(!row.published_at || Date.parse(row.published_at) <= Date.parse(row.collected_at),
    'legacy publication timestamp after collection');
  const title = normalizeField(row.title); const summary = normalizeField(row.summary); const content = normalizeField(row.content_text);
  const measured = [...title].length + [...summary].length + [...content].length;
  const stable = String(row.external_id || `legacy:${row.id}`).slice(0, 512);
  let canonicalUrlCandidate = null;
  try {
    const parsed = new URL(String(row.document_url ?? ''));
    if (['http:', 'https:'].includes(parsed.protocol)) canonicalUrlCandidate = parsed.toString().slice(0, 2048);
  } catch { /* absence is explicit */ }
  if (measured > 100000) return {
    sourceKey: mapping.sourceKey, sourceIdentityAuthorityId: identityAuthorityId, stableConnectorDocumentId: stable,
    canonicalUrlCandidate, publishedAt: row.published_at, collectedAt: row.collected_at,
    adapterVersion: 'source-adapter-v3.3', acquisitionStatus: 'content_overflow', rawFieldPayload: null,
    rawCodePointCount: 100001, rawFieldPayloadAlgorithmVersion: 'raw-field-payload-v3.0',
    ingestionContentRevisionSha256: null, canonicalContentAlgorithmVersion: 'canonical-content-v3.0',
    ingestionCanonicalContentHashV3: null, supersedesRevisionId: null,
  };
  const transcript = ['earnings_call', 'podcast', 'youtube'].includes(mapping.sourceKey);
  const fields = [title, summary, transcript ? [[0, stable, content]] : content];
  const canonicalFields = [['title', title], ['summary', summary],
    [transcript ? 'transcript' : 'body', transcript ? [[0, content]] : content]];
  return {
    sourceKey: mapping.sourceKey, sourceIdentityAuthorityId: identityAuthorityId, stableConnectorDocumentId: stable,
    canonicalUrlCandidate, publishedAt: row.published_at, collectedAt: row.collected_at,
    adapterVersion: 'source-adapter-v3.3', acquisitionStatus: 'complete', rawFieldPayload: fields,
    rawCodePointCount: measured, rawFieldPayloadAlgorithmVersion: 'raw-field-payload-v3.0',
    ingestionContentRevisionSha256: sha256(canonicalJson({ adapterVersion: 'source-adapter-v3.3', fields,
      version: 'raw-field-payload-v3.0' })), canonicalContentAlgorithmVersion: 'canonical-content-v3.0',
    ingestionCanonicalContentHashV3: sha256(canonicalJson(canonicalFields)), supersedesRevisionId: null,
  };
}

async function seedPrincipalBindings(client) {
  const rows = [
    { bindingId: uuidFromIdentity('stockinsider:bootstrap:opportunity-runner'), principalId: RUNNER_PRINCIPAL_ID,
      role: 'opportunity_runner', configurationHash: sha256(canonicalJson({ purpose: 'production-authority-bootstrap', role: 'opportunity_runner', version: 1 })) },
    { bindingId: uuidFromIdentity('stockinsider:bootstrap:source-reviewer'), principalId: SOURCE_REVIEWER_PRINCIPAL_ID,
      role: 'source_reviewer', configurationHash: sha256(canonicalJson({ purpose: 'production-authority-bootstrap', role: 'source_reviewer', version: 1 })) },
  ];
  await client.query(`WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      "bindingId" uuid,"principalId" uuid,role text,"configurationHash" text))
    INSERT INTO public.internal_principal_role_bindings_v3(binding_id,principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at)
    SELECT "bindingId","principalId",role::public.internal_principal_role_v3,clock_timestamp()-interval '1 second',NULL,'active',"configurationHash",clock_timestamp()
    FROM requested WHERE NOT EXISTS (SELECT 1 FROM public.internal_principal_role_bindings_v3 b
      WHERE b.binding_id=requested."bindingId")`, [JSON.stringify(rows)]);
}

async function appendOfficialRoster(client, roster) {
  const symbols = roster.map((row) => ({ symbol: row.symbol, id: uuidFromIdentity(`stockinsider:tw-stock:${row.symbol}`),
    name: row.shortName, sector: SECTOR_MAP[row.industryCode] ?? 'unknown' }));
  await client.query(`WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,symbol text,name text,sector text))
    INSERT INTO public.stocks(id,symbol,name,market,sector,created_at,updated_at)
    SELECT id,symbol,name,'TW',sector,clock_timestamp(),clock_timestamp() FROM requested
    WHERE NOT EXISTS (SELECT 1 FROM public.stocks retained WHERE retained.symbol=requested.symbol)`, [JSON.stringify(symbols)]);
  const ids = await client.query(`SELECT symbol,id FROM public.stocks WHERE symbol=ANY($1::varchar[])`, [roster.map((row) => row.symbol)]);
  const bySymbol = new Map(ids.rows.map((row) => [row.symbol, row.id]));
  invariant(bySymbol.size === roster.length, 'official roster stock identity underfilled');
  const authorityRows = roster.map((row) => ({ ...row, stockId: bySymbol.get(row.symbol),
    canonicalSector: SECTOR_MAP[row.industryCode] ?? 'unknown' }));
  await client.query(`WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      "stockId" uuid,symbol text,exchange text,"legalName" text,"shortName" text,provider text,
      "sourceTimestamp" timestamptz,"validFrom" timestamptz))
    SELECT appended.instrument_authority_id FROM requested CROSS JOIN LATERAL
      public.append_instrument_roster_authority_v3(ROW("stockId",symbol,exchange::public.stock_exchange_v3,
        'common_stock'::public.instrument_type_v3,'active'::public.listing_status_v3,"legalName","shortName",
        provider::public.official_roster_provider_v3,"sourceTimestamp","validFrom",NULL,'tw-instrument-roster-v3.0')::public.instrument_authority_input_v3,
        $2::uuid) appended`, [JSON.stringify(authorityRows), RUNNER_PRINCIPAL_ID]);
  await client.query(`WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      "stockId" uuid,exchange text,"industryCode" text,"canonicalSector" text,provider text,
      "sourceTimestamp" timestamptz,"validFrom" timestamptz))
    SELECT appended.assignment_authority_id FROM requested CROSS JOIN LATERAL
      public.append_stock_sector_assignment_v3(ROW("stockId",exchange::public.tw_market_v3,"industryCode",
        "canonicalSector"::public.canonical_sector_key_v3,provider::public.official_roster_provider_v3,
        "sourceTimestamp","validFrom",NULL,'tw-sector-taxonomy-v3.0','active'::public.authority_status_v3)::public.sector_assignment_input_v3,
        $2::uuid) appended`, [JSON.stringify(authorityRows), RUNNER_PRINCIPAL_ID]);
  return authorityRows;
}

async function appendSourceIdentities(client) {
  const platforms = Object.keys(SOURCE_MAP);
  const entities = (await client.query(`SELECT id,platform,source_key,created_at FROM public.source_entities
    WHERE status='active' AND platform=ANY($1::varchar[]) ORDER BY platform,id`, [platforms])).rows;
  const rows = entities.map((row) => ({ sourceIdentityId: row.id, sourceKey: SOURCE_MAP[row.platform].sourceKey,
    sourceClass: SOURCE_MAP[row.platform].sourceClass, distributionIdentity: String(row.source_key || `${row.platform}:${row.id}`),
    validFrom: row.created_at }));
  await client.query(`WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      "sourceIdentityId" uuid,"sourceKey" text,"sourceClass" text,"distributionIdentity" text,"validFrom" timestamptz))
    SELECT appended.authority_id FROM requested CROSS JOIN LATERAL
      public.append_source_identity_authority_v3(ROW("sourceIdentityId","sourceKey"::public.source_key_v3,
        "sourceClass"::public.source_class_v3,"distributionIdentity","validFrom",NULL,'active'::public.authority_status_v3)::public.source_identity_authority_input_v3,
        $2::uuid) appended`, [JSON.stringify(rows), SOURCE_REVIEWER_PRINCIPAL_ID]);
  const authorities = (await client.query(`SELECT DISTINCT ON(source_identity_id,source_key) source_identity_id,source_key,authority_id
    FROM public.source_identity_authorities_v3 WHERE status='active' AND approving_principal_id=$1
    ORDER BY source_identity_id,source_key,recorded_at DESC,authority_id`, [SOURCE_REVIEWER_PRINCIPAL_ID])).rows;
  return new Map(authorities.map((row) => [`${row.source_identity_id}:${row.source_key}`, row.authority_id]));
}

async function appendApprovedProfileIdentities(client) {
  invariant(approvedSourceRoster.schema === 'approved-source-roster-v3.13' &&
    approvedSourceRoster.profiles.length === 17, 'approved profile roster unavailable');
  const requested = approvedSourceRoster.profiles.flatMap((profile) => [
    profile.threads ? { sourceKey:'threads',sourceClass:'community',profileUrl:`https://www.threads.net/@${profile.threads}` } : null,
    profile.podcastFeed ? { sourceKey:'podcast',sourceClass:'curated_thesis',profileUrl:profile.podcastFeed } : null,
    profile.youtubeChannelId || profile.youtubeHandle ? { sourceKey:'youtube',sourceClass:'curated_thesis',
      profileUrl:profile.youtubeChannelId ? `https://www.youtube.com/channel/${profile.youtubeChannelId}` :
        `https://www.youtube.com/@${profile.youtubeHandle}` } : null,
  ].filter(Boolean).map((source) => ({
    id:uuidFromIdentity(`stockinsider:v313-source:${source.sourceKey}:${profile.id}`),
    platform:source.sourceKey,entityType:source.sourceKey === 'threads' ? 'kol' : 'channel',displayName:profile.name,
    sourceIdentityKey:`v313:${source.sourceKey}:${profile.id}`,distributionIdentity:`${source.sourceKey}:${profile.id}`,
    ...source,
  })));
  await client.query(`WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      id uuid,platform text,"entityType" text,"displayName" text,"sourceIdentityKey" text,"profileUrl" text))
    INSERT INTO public.source_entities(id,platform,entity_type,display_name,source_key,profile_url,status,metadata,created_at,updated_at)
    SELECT id,platform,"entityType","displayName","sourceIdentityKey","profileUrl",'active',
      jsonb_build_object('authority','approved-source-roster-v3.13'),clock_timestamp(),clock_timestamp()
    FROM requested ON CONFLICT(source_key) DO NOTHING`, [JSON.stringify(requested)]);
  const authorityRows = requested.map((row) => ({ sourceIdentityId:row.id,sourceKey:row.sourceKey,
    sourceClass:row.sourceClass,distributionIdentity:row.distributionIdentity,validFrom:new Date(0).toISOString() }));
  await client.query(`WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
      "sourceIdentityId" uuid,"sourceKey" text,"sourceClass" text,"distributionIdentity" text,"validFrom" timestamptz)),
    missing AS (SELECT requested.* FROM requested WHERE NOT EXISTS(
      SELECT 1 FROM public.source_identity_authorities_v3 retained
      WHERE retained.source_identity_id=requested."sourceIdentityId" AND retained.source_key::text=requested."sourceKey"
        AND retained.distribution_identity=requested."distributionIdentity" AND retained.status='active'))
    SELECT appended.authority_id FROM missing
    CROSS JOIN LATERAL public.append_source_identity_authority_v3(ROW("sourceIdentityId",
      "sourceKey"::public.source_key_v3,"sourceClass"::public.source_class_v3,"distributionIdentity",
      "validFrom",NULL,'active'::public.authority_status_v3)::public.source_identity_authority_input_v3,$2::uuid) appended`,
  [JSON.stringify(authorityRows), SOURCE_REVIEWER_PRINCIPAL_ID]);
  return requested.length;
}

async function selectLegacyDocuments(client) {
  const values = Object.entries(SOURCE_MAP);
  const params = []; const tuples = values.map(([platform, value]) => {
    params.push(platform, value.sourceKey); const index = params.length;
    return `($${index - 1}::text,$${index}::text)`;
  });
  return (await client.query(`WITH mapping(platform,source_key) AS (VALUES ${tuples.join(',')}), ranked AS (
      SELECT d.*,mapping.source_key,row_number() OVER(PARTITION BY mapping.source_key ORDER BY d.collected_at DESC,d.id) rank
      FROM public.source_raw_documents d JOIN mapping ON mapping.platform=d.platform
      WHERE d.source_entity_id IS NOT NULL AND d.collected_at<=clock_timestamp())
    SELECT * FROM ranked WHERE rank<=1000 ORDER BY source_key,collected_at DESC,id`, params)).rows;
}

async function appendLegacyDocuments(client, authorityByIdentity, { transactionPerBatch = false, limit = Number.POSITIVE_INFINITY } = {}) {
  const selected = await selectLegacyDocuments(client); const prepared = [];
  let rejectedMissingAuthority = 0; let rejectedInvalidTimestamp = 0;
  for (const row of selected.slice(0, limit)) {
    const sourceKey = SOURCE_MAP[row.platform].sourceKey;
    const authority = authorityByIdentity.get(`${row.source_entity_id}:${sourceKey}`);
    if (!authority) { rejectedMissingAuthority += 1; continue; }
    if (row.published_at && Date.parse(row.published_at) > Date.parse(row.collected_at)) {
      rejectedInvalidTimestamp += 1; continue;
    }
    prepared.push(prepareLegacyDocument(row, authority));
  }
  for (let offset = 0; offset < prepared.length; offset += 100) {
    const batch = prepared.slice(offset, offset + 100);
    if (transactionPerBatch) await client.query('BEGIN');
    try {
      await client.query(`WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        "sourceIdentityAuthorityId" uuid,"stableConnectorDocumentId" text,"canonicalUrlCandidate" text,
        "publishedAt" timestamptz,"collectedAt" timestamptz,"adapterVersion" text,"acquisitionStatus" text,
        "rawFieldPayload" jsonb,"rawCodePointCount" integer,"rawFieldPayloadAlgorithmVersion" text,
        "ingestionContentRevisionSha256" text,"canonicalContentAlgorithmVersion" text,
        "ingestionCanonicalContentHashV3" text,"supersedesRevisionId" uuid))
      SELECT appended.revision_id FROM requested CROSS JOIN LATERAL
        public.append_source_document_revision_v3(ROW("sourceIdentityAuthorityId","stableConnectorDocumentId",
          "canonicalUrlCandidate","publishedAt","collectedAt","adapterVersion",
          "acquisitionStatus"::public.source_acquisition_status_v3,"rawFieldPayload","rawCodePointCount",
          "rawFieldPayloadAlgorithmVersion","ingestionContentRevisionSha256","canonicalContentAlgorithmVersion",
          "ingestionCanonicalContentHashV3","supersedesRevisionId")::public.source_document_revision_input_v3,
          $2::uuid) appended`, [JSON.stringify(batch), RUNNER_PRINCIPAL_ID]);
      if (transactionPerBatch) await client.query('COMMIT');
    } catch (error) {
      if (transactionPerBatch) try { await client.query('ROLLBACK'); } catch { /* preserve append failure */ }
      throw error;
    }
  }
  return { selected: selected.length, attempted: prepared.length, rejectedInvalidTimestamp, rejectedMissingAuthority };
}

async function applyProductionAuthorityBootstrap({ client, roster, commit = true }) {
  let sessionLocked = false; let inTransaction = false;
  try {
    await client.query(`SELECT pg_advisory_lock(hashtextextended('stockinsider-production-authority-bootstrap-v1',0))`);
    sessionLocked = true;
    await client.query('BEGIN'); inTransaction = true;
    await seedPrincipalBindings(client);
    const official = await appendOfficialRoster(client, roster);
    const approvedProfileIdentityCount = await appendApprovedProfileIdentities(client);
    const authorityByIdentity = await appendSourceIdentities(client);
    let documents;
    if (commit) {
      await client.query('COMMIT'); inTransaction = false;
      documents = await appendLegacyDocuments(client, authorityByIdentity, { transactionPerBatch: true });
    } else {
      documents = await appendLegacyDocuments(client, authorityByIdentity, { limit: 20 });
    }
    const counts = (await client.query(`SELECT
      (SELECT count(*)::integer FROM public.stock_instruments_v3 WHERE instrument_type='common_stock' AND listing_status='active') instruments,
      (SELECT count(*)::integer FROM public.stock_aliases_v3 WHERE status='active') aliases,
      (SELECT count(*)::integer FROM public.stock_sector_assignments_v3 WHERE status='active') sectors,
      (SELECT count(*)::integer FROM public.source_identity_authorities_v3 WHERE status='active') source_identities,
      (SELECT count(*)::integer FROM public.source_document_revisions_v3 WHERE acquisition_status='complete') source_revisions`)).rows[0];
    invariant(counts.instruments >= 1700 && counts.aliases >= 1700 && counts.sectors >= 1700 &&
      counts.source_identities > 0 && (commit ? counts.source_revisions > 500 : documents.attempted > 0),
    'production authority bootstrap underfilled');
    if (!commit) { await client.query('ROLLBACK'); inTransaction = false; }
    return Object.freeze({ schema: 'stockinsider-production-authority-bootstrap-result-v1',
      disposition: commit ? 'applied' : 'rehearsed_rolled_back', officialRosterRows: official.length,
      approvedProfileIdentityCount,documents,counts });
  } catch (error) {
    try { if (inTransaction) await client.query('ROLLBACK'); } catch { /* original error is authoritative */ }
    throw error;
  } finally {
    if (sessionLocked) {
      try { await client.query(`SELECT pg_advisory_unlock(hashtextextended('stockinsider-production-authority-bootstrap-v1',0))`); }
      catch { /* a disconnected session releases its advisory lock */ }
    }
  }
}

module.exports = { RUNNER_PRINCIPAL_ID, SOURCE_MAP, SOURCE_REVIEWER_PRINCIPAL_ID, TPEX_ROSTER_URL, TWSE_ROSTER_URL,
  appendApprovedProfileIdentities,applyProductionAuthorityBootstrap, consumeBootstrapNonce, fetchOfficialRoster, normalizeOfficialRoster,
  prepareLegacyDocument, rocDateToIso, uuidFromIdentity, validateBootstrapAuthority, ymdToIso };

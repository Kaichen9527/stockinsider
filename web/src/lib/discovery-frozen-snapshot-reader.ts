import { canonicalJson } from './opportunity-v3/canonical.ts';
import { discoveryClock, discoveryPopulationHash, readDiscoveryRevisionPublishers,
  DISCOVERY_READER_BOUNDS, type ReaderInput, type ReaderTables } from './discovery-revision-publisher-reader.ts';

/** Server/operator injection only. Supply a NEW, unconnected dedicated client, never a pool/shared client.
 * Ownership transfers on invocation, including failure. No credentials/config/connection factory here. */
export interface DiscoverySnapshotClient {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<unknown>;
}
const consumed = new WeakSet<object>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const clock = (name: string) => `to_char(${name} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ${name}`;
const fields = (names: string[], clocks: string[]) => [...names, ...clocks.map(clock)].join(',');
// Fixed allowlists: full retained populations, without verification-linked/future/status filtering.
const streams = {
  revisions: { relation: 'source_document_revisions_v3', select: fields(['revision_id','revision_family_key','source_key','source_identity_authority_id','approved_source_identity_id','stable_connector_document_id','acquisition_status','adapter_version','ingestion_canonical_content_hash_v3'], ['published_at','collected_at','recorded_at']), where: '', order: 'source_key,revision_family_key,recorded_at,revision_id' },
  sourceAuthorities: { relation: 'source_identity_authorities_v3', select: fields(['authority_id','source_identity_id','source_key','source_class','distribution_identity','status','approving_principal_id'], ['valid_from','valid_to','approved_at','recorded_at']), where: '', order: 'source_identity_id,recorded_at,authority_id' },
  publishers: { relation: 'publisher_verification_authorities_v3', select: fields(['authority_id','publisher_identity_id','source_class','domains','feed_identity','institution_identity','approving_principal_id','status'], ['valid_from','valid_to','approved_at','recorded_at']), where: '', order: 'publisher_identity_id,recorded_at,authority_id' },
  registry: { relation: 'source_revision_family_registry_v3', select: fields(['source_key','revision_family_key','approved_source_identity_id','stable_connector_document_id'], ['registered_at']), where: '', order: 'source_key,revision_family_key' },
  verifications: { relation: 'source_publication_verifications_v3', select: fields(['verification_id','source_run_id','revision_id','publisher_manifest_id','publisher_identity_id','institution_identity','canonical_document_id','canonical_content_hash','evidence_ref'], ['source_cutoff','published_at','collected_at','recorded_at']), where: ' WHERE source_run_id=$1::uuid', order: 'verification_id' },
  manifests: { relation: 'opportunity_manifests_v3', select: fields(['manifest_id','manifest_kind','contract_version','status','row_count::integer AS row_count','root_json','manifest_hash'], ['source_cutoff','recorded_at','terminal_at']), where: ' WHERE manifest_id=$1::uuid', order: 'manifest_id' },
  manifestRows: { relation: 'opportunity_manifest_rows_v3', select: fields(['manifest_id','section_key','row_ordinal::integer AS row_ordinal','identity_key','terminal_code','payload_json','payload_hash'], ['recorded_at']), where: ' WHERE manifest_id=$1::uuid', order: 'section_key,row_ordinal,identity_key' },
} as const;
const names = Object.keys(streams) as (keyof ReaderTables)[];
const witnessSql = `SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only,pg_current_snapshot()::text AS snapshot_id,${clock('transaction_timestamp()').replace(' AS transaction_timestamp()', ' AS snapshot_at')}`;
const runSql = `SELECT run_id,status,${clock('source_cutoff')},${clock('sealed_at')} FROM public.opportunity_runs WHERE run_id=$1::uuid LIMIT 2`;
const inputSql = `SELECT run_id,manifest_id,input_role,ordinal,${clock('recorded_at')} FROM public.opportunity_run_manifest_inputs WHERE run_id=$1::uuid AND input_role='publisher_verification_allowlist' ORDER BY ordinal,manifest_id LIMIT 2`;
class ReadFailure extends Error { readonly reason: string; constructor(reason: string) { super(reason); this.reason=reason; } }
const fail = (reason: string): never => { throw new ReadFailure(reason); };
/** Only public pure projection + non-authority snapshot accounting leaves this module. */
export async function readDiscoveryFrozenSnapshot(client: DiscoverySnapshotClient, runId: string) {
  if (typeof window !== 'undefined' || typeof process === 'undefined' || !process.versions?.node) throw Error('server_only');
  if (!UUID.test(runId)) return { status: 'unsupported' as const, reason: 'invalid_run', projection: null, cleanup: 'not_acquired' as const };
  if (consumed.has(client)) return { status: 'unsupported' as const, reason: 'client_already_owned', projection: null, cleanup: 'not_acquired' as const };
  consumed.add(client);
  const end = performance.now() + 10000;
  let transaction = false, cleanup: 'confirmed' | 'pending' | 'failed' = 'pending';
  let reason: string | null = null;
  let result: { projection: ReturnType<typeof readDiscoveryRevisionPublishers>; snapshot: { identity: string; source_cutoff: string; scope: Record<string, string>; counts: Record<string, number>; digests: Record<string, string> } } | null = null;
  const wait = async <T,>(promise: Promise<T>): Promise<T> => {
    if (performance.now()>=end) fail('read_deadline');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { const value=await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ReadFailure('read_deadline')), Math.max(0, end-performance.now())); })]); if (performance.now()>=end) fail('read_deadline'); return value; }
    finally { if (timer) clearTimeout(timer); }
  };
  const query = async (sql: string, values?: unknown[]) => {
    if (performance.now()>=end) fail('read_deadline');
    const response = await wait(client.query(sql, values));
    if (!Array.isArray(response.rows)) fail('read_incomplete');
    return response.rows;
  };
  try {
    await wait(client.connect());
    transaction = true;
    await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await query("SET LOCAL statement_timeout='2000ms'");
    await query("SET LOCAL lock_timeout='500ms'");
    const witness = (await query(witnessSql))[0];
    const verifyWitness = (w: Record<string, unknown>) => {
      if (!w || w.isolation !== 'repeatable read' || w.read_only !== 'on' || typeof w.snapshot_id !== 'string' || !/^\d+:\d+:[\d,]*$/u.test(w.snapshot_id) || typeof w.snapshot_at !== 'string') fail('snapshot_not_readonly');
      discoveryClock(w.snapshot_at as string);
    };
    verifyWitness(witness);
    const visibility=(await query("SELECT count(*)::integer AS relations,bool_or(row_security_active(c.oid)) AS rls_active FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname IN ('opportunity_runs','opportunity_run_manifest_inputs','source_document_revisions_v3','source_identity_authorities_v3','publisher_verification_authorities_v3','source_revision_family_registry_v3','source_publication_verifications_v3','opportunity_manifests_v3','opportunity_manifest_rows_v3')"))[0];
    if (!visibility || visibility.relations!==9 || visibility.rls_active!==false) fail('population_visibility_unknown');
    const runs = await query(runSql, [runId]);
    if (runs.length !== 1) fail(runs.length ? 'run_ambiguous' : 'run_missing');
    const run = runs[0] as ReaderInput['run'];
    if (run.run_id !== runId || run.status !== 'success' || !run.sealed_at || discoveryClock(run.source_cutoff)>discoveryClock(witness.snapshot_at as string) || discoveryClock(run.sealed_at)>discoveryClock(witness.snapshot_at as string)) fail('run_not_frozen');
    const inputs = await query(inputSql, [runId]);
    if (inputs.length !== 1 || inputs[0].ordinal !== 0 || inputs[0].run_id !== runId || typeof inputs[0].manifest_id !== 'string' || !UUID.test(inputs[0].manifest_id)) fail('manifest_input_missing_or_ambiguous');
    const input = inputs[0] as ReaderInput['publisher_manifest_input'];
    const tables = {} as ReaderTables, counts: Record<string, number> = {}, digests: Record<string, string> = {}, sizes: Record<string, number> = {}, scope: Record<string, string> = {};
    let total = 0, bytes = 0;
    const args = (name: keyof ReaderTables) => name === 'verifications' ? [runId] : ['manifests','manifestRows'].includes(name) ? [input.manifest_id] : undefined;
    const sql = (name: keyof ReaderTables) => { const s=streams[name]; return `SELECT ${s.select} FROM public.${s.relation}${s.where}`; };
    const countSql = (name: keyof ReaderTables) => `SELECT count(*)::text AS exact_count,coalesce(sum(octet_length(convert_to(row_to_json(p)::text,'UTF8'))),0)::text AS bytes FROM (${sql(name)}) p`;
    const count = (row: Record<string, unknown>) => {
      if (!row || !/^\d+$/u.test(String(row.exact_count)) || !/^\d+$/u.test(String(row.bytes))) fail('count_unavailable');
      const n=Number(row.exact_count), size=Number(row.bytes);
      if (!Number.isSafeInteger(n) || n>DISCOVERY_READER_BOUNDS.perTableRows || !Number.isSafeInteger(size) || size>DISCOVERY_READER_BOUNDS.serializedBytes) fail('population_bound');
      return {n,size};
    };
    // All exact count/byte checks precede population transfer; no LIMIT-as-completeness.
    for (const name of names) {
      const rows=await query(countSql(name),args(name)); if (rows.length!==1) fail('count_unavailable');
      const {n,size}=count(rows[0]); counts[name]=n; sizes[name]=size; total+=n; bytes+=size;
      if (total>DISCOVERY_READER_BOUNDS.totalRows || bytes>DISCOVERY_READER_BOUNDS.serializedBytes) fail('population_bound');
      scope[name]=`public.${streams[name].relation}:${streams[name].where ? name==='verifications'?'exact_run':'exact_manifest':'all_retained'}`;
    }
    for (const name of names) {
      const rows=await query(`${sql(name)} ORDER BY ${streams[name].order} LIMIT 4097`,args(name));
      if (rows.length!==counts[name]) fail('population_incomplete');
      (tables[name] as unknown[])=rows;
      digests[name]=discoveryPopulationHash(rows);
    }
    const population={run_id:runId,source_cutoff:run.source_cutoff,tables:Object.fromEntries(names.map(name=>[name,{exact_count:counts[name],projection_sha256:digests[name]}]))} as ReaderInput['population'];
    const packet: ReaderInput={run,snapshot_at:witness.snapshot_at as string,publisher_manifest_input:input,population,tables};
    if (Buffer.byteLength(canonicalJson(packet),'utf8')>DISCOVERY_READER_BOUNDS.serializedBytes) fail('population_bound');
    const projection=readDiscoveryRevisionPublishers(packet);
    for (const name of names) {
      const rows=await query(countSql(name),args(name)); const current=count(rows[0]);
      if (rows.length!==1 || current.n!==counts[name] || current.size!==sizes[name]) fail('snapshot_changed');
    }
    const after=(await query(witnessSql))[0];verifyWitness(after);
    if (after.snapshot_id!==witness.snapshot_id || after.snapshot_at!==witness.snapshot_at) fail('snapshot_changed');
    result={projection,snapshot:{identity:witness.snapshot_id as string,source_cutoff:run.source_cutoff,scope,counts,digests}};
    if (Buffer.byteLength(canonicalJson(result),'utf8')>DISCOVERY_READER_BOUNDS.serializedBytes) fail('output_bound');
  } catch (error) { reason=error instanceof ReadFailure ? error.reason : 'read_failed'; }
  finally {
    if (transaction) { try { await wait(client.query('ROLLBACK')); } catch { reason=reason??'rollback_unconfirmed'; } }
    const closing=Promise.resolve().then(()=>client.end());
    closing.then(()=>{cleanup='confirmed';},()=>{cleanup='failed';});
    try { await wait(closing); cleanup='confirmed'; } catch (error) { reason=reason??(cleanup==='confirmed' && error instanceof ReadFailure ? error.reason : 'cleanup_unconfirmed'); }
  }
  if (reason || cleanup!=='confirmed' || !result) return {status:'unsupported' as const,reason:reason??'cleanup_unconfirmed',projection:null,cleanup};
  return {status:result.projection.status,reason:result.projection.reason,...result,cleanup};
}

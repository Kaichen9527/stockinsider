import { sha256Canonical } from './opportunity-v3/canonical.ts';
import { discoveryClock, discoveryPopulationHash, 
  type ReaderInput, type PublisherAuthority } from './discovery-revision-publisher-reader.ts';
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const cut = '2026-10-08T12:00:00.123456Z', old = '2026-10-08T11:00:00.123456Z';
const later = '2026-10-08T12:01:00.123456Z';
const native = (p: PublisherAuthority) => [p.authority_id,p.publisher_identity_id,p.source_class,p.domains,
  p.feed_identity,p.institution_identity,p.valid_from,p.valid_to,p.approved_at,p.approving_principal_id,p.status,p.recorded_at];
function manifest(x: ReaderInput) {
  const m = x.tables.manifests[0];
  const payload = native(x.tables.publishers[0]);
  const ph = sha256Canonical(payload);
  const p=x.tables.publishers[0];const terminal=p.status==='active'&&(p.valid_to===null||discoveryClock(p.valid_to)>discoveryClock(cut))?'effective_active':'revoked_or_expired';
  const identity = sha256Canonical(['opportunity-manifest-row-identity-v3.3', m.manifest_kind, 'rows', 0, ph]);
  const page = ['opportunity-manifest-page-v3.3',m.manifest_kind,m.contract_version,cut,'rows',0,0,[[0,identity,terminal,payload]]];
  m.root_json = ['opportunity-manifest-root-v3.3',m.manifest_kind,m.contract_version,cut,[['rowCount',1],['sourceCutoff',cut]],
    [['rows',1,[[0,0,1,identity,identity,sha256Canonical(page)]]]]];
  m.manifest_hash = sha256Canonical(m.root_json);
  x.tables.manifestRows = [{manifest_id:m.manifest_id,section_key:'rows',row_ordinal:0,identity_key:identity,
    terminal_code:terminal,payload_json:payload,payload_hash:ph,recorded_at:later}];
}
function counted(x: ReaderInput) {
  for (const name of Object.keys(x.tables) as (keyof ReaderInput['tables'])[]) x.population.tables[name] = {
    exact_count:x.tables[name].length,projection_sha256:discoveryPopulationHash(x.tables[name])};
  return x;
}
/** Synthetic, real relation/native manifest shapes; no live authority or model execution. */
export function fixture(): ReaderInput {
  const x: ReaderInput = {run:{run_id:id(1),source_cutoff:cut,status:'success',sealed_at:later},snapshot_at:later,
    publisher_manifest_input:{run_id:id(1),manifest_id:id(7),input_role:'publisher_verification_allowlist',ordinal:0,recorded_at:later},
    population:{run_id:id(1),source_cutoff:cut,tables:{} as ReaderInput['population']['tables']},tables:{
      revisions:[{revision_id:id(2),revision_family_key:'a'.repeat(64),source_key:'ptt',source_identity_authority_id:id(3),
        approved_source_identity_id:id(4),stable_connector_document_id:'original-article',published_at:old,collected_at:old,recorded_at:old,
        acquisition_status:'complete',adapter_version:'source-adapter-v3.3',ingestion_canonical_content_hash_v3:'b'.repeat(64)}],
      sourceAuthorities:[{authority_id:id(3),source_identity_id:id(4),source_key:'ptt',source_class:'community',distribution_identity:'retained-profile',
        valid_from:old,valid_to:null,status:'active',approved_at:old,approving_principal_id:id(8),recorded_at:old}],
      publishers:[{authority_id:id(5),publisher_identity_id:id(6),source_class:'official',domains:['example.test'],feed_identity:null,institution_identity:null,
        valid_from:old,valid_to:null,status:'active',approved_at:old,approving_principal_id:id(8),recorded_at:old}],
      verifications:[{verification_id:id(9),source_run_id:id(1),source_cutoff:cut,revision_id:id(2),publisher_manifest_id:id(7),publisher_identity_id:id(6),
        institution_identity:null,canonical_document_id:'reviewed-document-id',canonical_content_hash:'b'.repeat(64),published_at:old,collected_at:old,evidence_ref:'public-summary:synthetic',recorded_at:later}],
      registry:[{source_key:'ptt',revision_family_key:'a'.repeat(64),approved_source_identity_id:id(4),stable_connector_document_id:'original-article',registered_at:old}],
      manifests:[{manifest_id:id(7),manifest_kind:'publisher_verification_allowlist',contract_version:'source-publisher-allowlist-v3.0',source_cutoff:cut,
        status:'complete',row_count:1,root_json:[],manifest_hash:'',recorded_at:later,terminal_at:later}],manifestRows:[]}};
  manifest(x); return counted(x);
}

"""Closed real-backup orchestration SOURCE contract; no executable adapter.

This fixes the reviewable order and exact historical portability references.
No fact/receipt/boolean, descriptor, callback, key or filesystem path passed by
a caller can enable execution. Tests describe source order only, not admission.
"""
from dataclasses import dataclass, field

SOURCE_REVISION = '9bca1e30b3f6d481c722fcc33f12f93cc286749e'
HISTORICAL_RUNNER = 'scripts/rehearse-contabo-database-restore.mjs'
TOC_FILTER = 'scripts/build-contabo-restore-list.mjs'
BOOTSTRAP = 'deployment/vps/bootstrap-stockinsider-postgres.sql'
COMPAT_MIGRATION = 'migrations/20260911_contabo_data_plane_v1.sql'

# These are provenance references, not caller hashes or a runtime trust store.
PINNED_SOURCE_BLOBS = (
    (TOC_FILTER, '897c74009ced9a8f8d8991d8eee80a5e7e4444a0'),
    (BOOTSTRAP, 'c58d12585d312701d47b5789d0572f8453424697'),
    (COMPAT_MIGRATION, 'f3fa038cf6695f9ff8a8b422b1b3a64ed6da565a'),
)

# Reuse the existing JS TOC implementation; do not reimplement its grammar.
TOC_EXCLUSIONS = (
    'vault namespace objects', 'supabase_vault extension/comment',
    'bootstrap-owned extensions schema',
    'read_threads_source_secret', 'refresh_threads_source_secret',
    'refresh_threads_source_secret_v7', 'revoke_threads_source_credential_v7',
    'read_stockinsider_finmind_api_token_v6', 'bootstrap_stockinsider_finmind_api_token_v6',
    'issue_graphql_placeholder', 'issue_pg_cron_access', 'issue_pg_graphql_access',
    'issue_pg_net_access', 'pgrst_ddl_watch', 'pgrst_drop_watch',
)
DISARM_RESTORED_ONLY_SQL = (
    'UPDATE public.stockinsider_data_plane_settings_v1 '
    'SET identity_fence_enabled=false, activated_at=NULL, activated_by=NULL WHERE singleton'
)
PORTABLE_ROLES = (
    'anon', 'authenticated', 'service_role', 'authenticator',
    'opportunity_v3_rpc_owner', 'legacy_correctness_rpc_owner', 'postgres',
    'supabase_admin', 'supabase_auth_admin', 'supabase_realtime_admin',
    'supabase_storage_admin', 'pgbouncer', 'dashboard_user', 'stockinsider_runtime_v319',
)
DATA_PLANE_TABLES = (
    'stockinsider_data_plane_settings_v1', 'stockinsider_backend_identities_v1',
    'provider_credentials_encrypted_v1', 'private_artifact_receipts_v1',
)
DATA_PLANE_FUNCTIONS = (
    'assert_stockinsider_backend_request_v1', 'read_provider_credential_envelope_v1',
    'read_provider_credential_state_v1', 'replace_provider_credential_cas_v1',
    'revoke_provider_credential_cas_v1', 'register_private_artifact_receipt_v1',
)
APPLICATION_TABLES = (
    'source_run_ledger', 'candidate_source_mentions', 'candidate_research_runs',
    'candidate_research_run_items', 'official_price_history',
    'candidate_detail_snapshots', 'radar_public_snapshots',
)
APPLICATION_FUNCTIONS = (
    'source_document_coverage', 'publish_radar_public_snapshots',
    'candidate_research_stock_authority_page',
)

# Preserve historical predicates; they are planned assertions, never evaluated
# here. Historical owner aggregation is not itself a trusted ownership policy.
VALIDATION_PREDICATES = (
    'portableRoles == 14', 'loginCompatibilityRoles == 0',
    'postgrestRuntimeLogin == 1 with no elevated role attributes',
    'serviceRoleBypassesRls is true', 'dataPlaneTables == 4',
    'dataPlaneFunctions == 6', 'writerFenceFunctions == 1',
    'identityFenceEnabled is false', 'vaultSchemaPresent is false',
    'vaultExtensionPresent is false', 'publicTables > 0', 'publicFunctions > 0',
    'userTriggers > 0', 'rlsTables > 0', 'policies > 0',
    'applicationTables == 7', 'applicationFunctions == 3',
    'serviceRoleTableGrants > 0', 'serviceRoleRoutineGrants > 0',
    'owner aggregation collected and compared to separately reviewed ownership allowlist',
    'complete-set database/storage/provider relations and lineage checked separately',
)


@dataclass(frozen=True)
class Phase:
    id: str
    intent: str
    source: str = ''


SOURCE_PLAN = (
    Phase('independent_admission', 'Separately reviewed runtime capability; native HOLD/gates still block live'),
    Phase('host_lock_capacity', 'Exclusive host lock through shutdown; current per-mount full peak and 15GiB/1.5GiB reserves'),
    Phase('sandbox_binding', 'Dedicated nonroot isolated source/data/runtime; no production mounts, sockets, network, writer, service or inherited PG environment'),
    Phase('trusted_complete_set', 'Independent provenance and exact database/storage/provider member inventory; manifests/receipts alone are untrusted'),
    Phase('external_keystore', 'Independent approved keystore; owned 32-byte FD plus EOF, deadline, close/zeroization; no new key file/env/argv/backend'),
    Phase('immutable_ciphertext', 'Kernel-verified immutable disk custody held through all passes; outstanding writer must reject; no pathname reopen'),
    Phase('authenticate_all', 'Complete GCM tag/context/length/digest verification on same held immutable FD before ANY TOC or SQL child'),
    Phase('list_toc', 'Bounded pg_restore --list via authenticated replay of same FD; terminal status/EPIPE/truncation checked', HISTORICAL_RUNNER),
    Phase('filter_toc', 'Reuse exact portability filter and retain owner/ACL entries; no wider omissions', TOC_FILTER),
    Phase('new_pg17_cluster', 'Trusted fixed PG17/C/UTF8; new private peer/host-reject cluster with no TCP; startup and environment independently observed'),
    Phase('new_database', 'Only new disposable staging database in owned cluster; no existing DB rename or replacement'),
    Phase('portable_bootstrap', 'Replay reviewed NOLOGIN compatibility owners/runtime role and extensions bootstrap', BOOTSTRAP),
    Phase('restore_owner_acl', 'pg_restore --use-list --exit-on-error, preserving owner/ACL replay; authenticated same-FD stream only', HISTORICAL_RUNNER),
    Phase('compat_migration', 'Apply only the exact existing data-plane compatibility migration', COMPAT_MIGRATION),
    Phase('disarm_restored_identity', 'Disable ONLY restored identity fence, clear activation metadata BEFORE any application access; preserve production fence', HISTORICAL_RUNNER),
    Phase('owner_rls_app_checks', 'Retain original portable/owner/RLS/app/grant/fence/vault checks and independently reviewed expected ownership/lineage', HISTORICAL_RUNNER),
    Phase('complete_set_checks', 'Independent storage/provider recovery and key escrow receipts; no decrypt/exercise provider credentials in this slice'),
    Phase('shutdown_reap', 'Bounded owned process shutdown/reaping; close replay pipes/key/ciphertext FDs; retain failures'),
    Phase('continuity_and_cleanup', 'Verify production signatures unchanged and exact staging inode/loop/namespace cleanup before releasing host lock'),
)
ABORT_CONTRACT = (
    'Never start further TOC/SQL/application consumers after a prerequisite fails',
    'Terminate only owned staging children, bound wait/escalation and reap',
    'Close owned streams and key FD; clear owned key/plaintext buffers without claiming external erasure',
    'Keep immutable custody and sandbox resources owned until all consumers stop',
    'Remove only exact owned staging artifacts/inodes; preserve failure evidence and do not prune originals',
    'Verify production continuity and release host lock last; cleanup failure remains failed',
)


@dataclass(frozen=True)
class SourcePrefix:
    described_phases: int
    next_phase: str | None
    state: str = field(default='SourceOnly', init=False)
    execution_allowed: bool = field(default=False, init=False)
    restore_verified: bool = field(default=False, init=False)
    staging_accepted: bool = field(default=False, init=False)


def describe_source_plan():
    """No caller settings, executable/path overrides or registration hooks."""
    return SOURCE_PLAN


def inspect_source_prefix(phase_ids):
    """Validate only source ordering, NOT observations or completed host work."""
    if type(phase_ids) is not tuple or any(type(value) is not str for value in phase_ids):
        raise ValueError('source_phase_tuple_required')
    expected = tuple(phase.id for phase in SOURCE_PLAN)
    if len(phase_ids) > len(expected) or phase_ids != expected[:len(phase_ids)]:
        raise ValueError('source_order_rejected')
    return SourcePrefix(len(phase_ids), expected[len(phase_ids)] if len(phase_ids) < len(expected) else None)


def execute_real_backup_restore(*args, **kwargs):
    """Unconditionally closed, even after an entire valid source-plan trace."""
    raise RuntimeError('real_restore_runtime_integration_disabled')

"""Source-contract tests only. No host, PostgreSQL, SQL, backup or key access."""
from dataclasses import FrozenInstanceError
import unittest
from deployment.staging.vnext.t17_keyfd import restore_orchestration as m


class RestoreOrchestrationSourceTests(unittest.TestCase):
    def test_historical_portability_sequence_is_exact_and_ordered(self):
        ids = tuple(p.id for p in m.describe_source_plan())
        essential = ('authenticate_all','list_toc','filter_toc','new_pg17_cluster',
                     'new_database','portable_bootstrap','restore_owner_acl',
                     'compat_migration','disarm_restored_identity','owner_rls_app_checks')
        positions = [ids.index(phase) for phase in essential]
        self.assertEqual(positions, sorted(positions))
        self.assertEqual(len(set(ids)), len(ids))
        source = {p.id:p.source for p in m.SOURCE_PLAN}
        self.assertEqual(source['filter_toc'], 'scripts/build-contabo-restore-list.mjs')
        self.assertEqual(source['portable_bootstrap'], 'deployment/vps/bootstrap-stockinsider-postgres.sql')
        self.assertEqual(source['compat_migration'], 'migrations/20260911_contabo_data_plane_v1.sql')

    def test_all_valid_prefixes_and_full_trace_remain_source_only(self):
        ids = tuple(p.id for p in m.SOURCE_PLAN)
        for length in range(len(ids)+1):
            result = m.inspect_source_prefix(ids[:length])
            self.assertEqual(result.state, 'SourceOnly')
            self.assertFalse(result.execution_allowed)
            self.assertFalse(result.restore_verified)
            self.assertFalse(result.staging_accepted)
            self.assertEqual(result.described_phases,length)

    def test_missing_duplicate_reordered_or_unknown_phase_is_not_admitted(self):
        ids = tuple(p.id for p in m.SOURCE_PLAN)
        for wrong in ((True,), ('host_lock_capacity',), ids[:2]+ids[:1],
                      ids[:5]+ids[6:], ids+('publish',), tuple(reversed(ids))):
            with self.assertRaises(ValueError):m.inspect_source_prefix(wrong)
        for wrong in (True, [], {'verified':True}, 'independent_admission'):
            with self.assertRaises(ValueError):m.inspect_source_prefix(wrong)

    def test_no_boolean_receipt_callback_fd_or_complete_trace_enables_execution(self):
        full = m.inspect_source_prefix(tuple(p.id for p in m.SOURCE_PLAN))
        for args, kwargs in (((),{}), ((True,),{}), ((full,),{}),
                             (({'approved':True,'restoreVerified':True},),{}),
                             ((3,),{}), ((),{'adapter':lambda:self.fail('adapter_called')})):
            with self.assertRaisesRegex(RuntimeError,'^real_restore_runtime_integration_disabled$'):
                m.execute_real_backup_restore(*args,**kwargs)
        with self.assertRaises(TypeError):m.describe_source_plan(True)

    def test_contract_is_immutable_and_does_not_accept_caller_overrides(self):
        with self.assertRaises(FrozenInstanceError):m.SOURCE_PLAN[0].intent='approved'
        with self.assertRaises(TypeError):m.inspect_source_prefix((), ready=True)
        with self.assertRaises(TypeError):m.SourcePrefix(19, None, execution_allowed=True)
        self.assertEqual(m.SOURCE_REVISION,'9bca1e30b3f6d481c722fcc33f12f93cc286749e')

    def test_original_exclusions_roles_predicates_and_disarm_are_retained(self):
        self.assertEqual(len(m.PORTABLE_ROLES),14)
        self.assertEqual(len(m.DATA_PLANE_TABLES),4)
        self.assertEqual(len(m.DATA_PLANE_FUNCTIONS),6)
        self.assertEqual(len(m.APPLICATION_TABLES),7)
        self.assertEqual(len(m.APPLICATION_FUNCTIONS),3)
        self.assertEqual(len(m.TOC_EXCLUSIONS),15)
        for retained in ('vault namespace objects','supabase_vault extension/comment',
                         'bootstrap-owned extensions schema','pgrst_drop_watch',
                         'bootstrap_stockinsider_finmind_api_token_v6'):
            self.assertIn(retained,m.TOC_EXCLUSIONS)
        self.assertEqual(m.DISARM_RESTORED_ONLY_SQL,
            'UPDATE public.stockinsider_data_plane_settings_v1 SET identity_fence_enabled=false, activated_at=NULL, activated_by=NULL WHERE singleton')
        for retained in ('portableRoles == 14','loginCompatibilityRoles == 0',
                         'identityFenceEnabled is false','rlsTables > 0','policies > 0',
                         'applicationTables == 7','applicationFunctions == 3'):
            self.assertIn(retained,m.VALIDATION_PREDICATES)

    def test_abort_contract_retains_resources_until_owned_children_stop(self):
        self.assertIn('owned staging children',m.ABORT_CONTRACT[1])
        self.assertIn('until all consumers stop',m.ABORT_CONTRACT[3])
        self.assertIn('host lock last',m.ABORT_CONTRACT[-1])


if __name__ == '__main__':
    unittest.main()

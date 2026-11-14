"""Real PG17/public SQL fixtures only. No supplied backup/key/connection."""
import os
import unittest
from deployment.staging.vnext.t17_keyfd import portable_sql_fixture_adapter as m


class PortableSqlFixtureTests(unittest.TestCase):
    def test_actual_pg17_portable_sql_fixture_and_owned_cleanup(self):
        # Poisoned inherited PG settings must never reach any child connection.
        prior={key:os.environ.get(key) for key in ('PGHOST','PGDATABASE','PGSERVICE','TMPDIR')}
        try:
            os.environ.update(PGHOST='PRODUCTION_CONNECTION_MUST_NOT_BE_USED',
                              PGDATABASE='forbidden',PGSERVICE='forbidden',
                              TMPDIR='/caller_supplied_forbidden_temp_root')
            receipt=m.run_portable_sql_fixture()
        finally:
            for key,value in prior.items():
                if value is None:os.environ.pop(key,None)
                else:os.environ[key]=value
        self.assertTrue(receipt['passed'])
        self.assertTrue(all(receipt['cleanup'].values()))
        self.assertFalse(receipt['liveRestoreAllowed'])
        self.assertFalse(receipt['fullApplicationAcceptance'])
        self.assertEqual(receipt['checks']['portableRoles'],14)
        self.assertEqual(receipt['checks']['fixtureOwners'],2)
        self.assertEqual(receipt['checks']['fixtureRls'],2)
        self.assertEqual(receipt['checks']['providerRows'],0)
        self.assertTrue(receipt['fixtureAnonWriteRejected'])
        print('PORTABLE_SQL_FIXTURE_EVIDENCE='+__import__('json').dumps(receipt,sort_keys=True))

    def test_fixture_accepts_no_connection_source_key_or_admission_override(self):
        for kwargs in ({'connection':'postgresql://forbidden'}, {'backup':'forbidden'},
                       {'key_fd':3},{'ready':True},{'pg_bin':'forbidden'}):
            with self.assertRaises(TypeError):m.run_portable_sql_fixture(**kwargs)

    def test_live_restore_always_disabled_even_with_success_receipt(self):
        for args in ((),(True,),({'passed':True,'restoreVerified':True},),(3,)):
            with self.assertRaisesRegex(RuntimeError,'^real_restore_runtime_integration_disabled$'):
                m.execute_real_backup_restore(*args)

    def test_pinned_original_source_bytes_match(self):
        sources=m._pinned_sources()
        self.assertEqual(set(sources),set(path for path,_ in m.PINNED))
        self.assertIn(b'CREATE EXTENSION IF NOT EXISTS pgcrypto',sources[m.PINNED[0][0]])
        self.assertIn(b'identity_fence_enabled',sources[m.PINNED[1][0]])


if __name__=='__main__':unittest.main()

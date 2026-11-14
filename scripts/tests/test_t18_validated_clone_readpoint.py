"""Generated public PG17 only; scoped reader observation grants no app authority."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from deployment.staging.vnext.t17_keyfd import portable_restore_engine as e
from test_t17_portable_restore_engine import public_archive


def replay_archive(archive):
    def replay(consume):
        for offset in range(0,len(archive),16384):consume(archive[offset:offset+16384])
    return replay


class ValidatedCloneReadpointTests(unittest.TestCase):
    def test_actual_three_profile_restore_observes_before_cleanup(self):
        with tempfile.TemporaryDirectory(prefix='t18-readpoint-',dir='/tmp') as directory:
            os.chmod(directory,0o700)
            archive=public_archive(directory,large_rows=2,not_valid_case='all_valid_rows')
            result=e.observe_owned_radar_reader(replay_archive(archive),Path(directory))
            database=result['database']
            self.assertTrue(database['databaseRestored'])
            self.assertEqual(database['invalidConstraints'],3)
            self.assertEqual((database['appRls'],database['appSelect'],database['appExecute']),(7,7,3))
            self.assertEqual((database['lineageRelationsChecked'],database['lineageOrphans']),(7,0))
            self.assertEqual(result['readerObservation']['status'],'GAP_SCHEMA')
            self.assertTrue(all(database['cleanup'].values()))
            self.assertEqual(list(Path(directory).iterdir()),[])

    def test_actual_db_failure_never_reaches_reader(self):
        with tempfile.TemporaryDirectory(prefix='t18-readpoint-',dir='/tmp') as directory:
            os.chmod(directory,0o700)
            for kwargs,reason in (({'not_valid_case':'violating_rows'},'lineage_structure_rejected'),
                                  ({'orphan':True},'lineage_orphans_rejected')):
                archive=public_archive(directory,large_rows=2,**kwargs)
                # Instrument invocation only; neither admission nor SQL is mocked.
                with patch.object(e._ValidatedClone,'observe_radar_reader',side_effect=AssertionError('reader_must_not_run')) as reader:
                    with self.assertRaisesRegex(e.RestoreEngineRejected,'^'+reason+'$'):
                        e.observe_owned_radar_reader(replay_archive(archive),Path(directory))
                    reader.assert_not_called()
                self.assertEqual(list(Path(directory).iterdir()),[])

    def test_reader_failure_closes_actual_cluster_and_handle_expires(self):
        with tempfile.TemporaryDirectory(prefix='t18-readpoint-',dir='/tmp') as directory:
            os.chmod(directory,0o700)
            archive=public_archive(directory,large_rows=2)
            with e._owned_validated_clone(replay_archive(archive),Path(directory)) as clone:
                self.assertEqual(clone.observe_radar_reader()['status'],'GAP_SCHEMA')
                self.assertTrue(any(Path(directory).iterdir()))
            with self.assertRaisesRegex(e.RestoreEngineRejected,'^verified_clone_scope_closed$'):
                clone.observe_radar_reader()
            self.assertTrue(all(clone.receipt['cleanup'].values()))
            self.assertEqual(list(Path(directory).iterdir()),[])
            with patch('deployment.staging.vnext.t17_keyfd.radar_reader_observation.assess_radar_reader',side_effect=RuntimeError('PUBLIC_FAILURE_FIXTURE')):
                with self.assertRaisesRegex(e.RestoreEngineRejected,'^validated_clone_readpoint_failed$'):
                    e.observe_owned_radar_reader(replay_archive(archive),Path(directory))
            self.assertEqual(list(Path(directory).iterdir()),[])

    def test_no_boolean_receipt_connection_or_command_admission(self):
        for fake in (True,{'databaseRestored':True}):
            with self.assertRaisesRegex(e.RestoreEngineRejected,'^engine_input_rejected$'):
                e.observe_owned_radar_reader(fake,Path('/tmp'))
        for kwargs in ({'command':'id'},{'callback':lambda:None},{'ready':True},{'receipt':{'passed':True}}):
            with self.assertRaises(TypeError):
                e.observe_owned_radar_reader(lambda _:None,Path('/tmp'),**kwargs)
            with self.assertRaises(TypeError):
                e.restore_owned_database(lambda _:None,Path('/tmp'),**kwargs)

    def test_fixed_cli_actual_cloud_admission_refuses_before_pg(self):
        root=Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(prefix='t18-cli-',dir='/tmp') as directory:
            p=subprocess.run([sys.executable,'-I','-B',str(root/'scripts/staging_restore_reader_preflight.py'),'--work-root',directory],
                env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},capture_output=True,timeout=10)
            self.assertEqual(p.returncode,2)
            result=json.loads(p.stdout)
            self.assertEqual(result['status'],'REJECTED')
            self.assertFalse(result['databaseRestored'])
            self.assertTrue(result['nativeHoldRetained'])
            self.assertNotIn(directory,p.stdout.decode())
            self.assertEqual(p.stderr,b'')
            self.assertEqual(list(Path(directory).iterdir()),[])


if __name__=='__main__':unittest.main()

"""Actual public PG NOT VALID fixtures, strict privacy projection, no repair."""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from deployment.staging.vnext.t17_keyfd import portable_restore_engine as engine
from deployment.staging.vnext.t17_keyfd.constraint_diagnostics import (
    CONTYPES,PHASE,project_constraint_diagnostics,diagnostic_after_cleanup)
from test_t17_portable_restore_engine import public_archive


def public_counts():
    buckets={kind:{'total':0,'unvalidated':0} for kind in CONTYPES}
    buckets['c']={'total':3,'unvalidated':1}
    buckets['f']={'total':2,'unvalidated':0}
    return {'phase':PHASE,'invalidConstraints':1,'foreignKeys':2,'byContype':buckets,
            'knownLegacyPaidContentCheck':{'matches':1,'unvalidated':1}}


class ConstraintDiagnosticsTests(unittest.TestCase):
    def test_exact_single_or_three_historical_profiles_succeed_without_changing_bits(self):
        for case,expected in (('valid_rows',1),('all_valid_rows',3)):
            with self.subTest(case=case), tempfile.TemporaryDirectory(prefix='t17-diagnostic-',dir='/tmp') as directory:
                os.chmod(directory,0o700)
                archive=public_archive(directory,large_rows=2,not_valid_case=case)
                def replay(consume):
                    for offset in range(0,len(archive),16384):consume(archive[offset:offset+16384])
                result=engine.restore_owned_database(replay,Path(directory))
                self.assertTrue(result['databaseRestored'])
                self.assertEqual(result['invalidConstraints'],expected)
                self.assertEqual(result['historicalCheckCompatibility']['totalUnvalidated'],expected)
                self.assertEqual(sum(p['checked'] for p in result['historicalCheckCompatibility']['profiles']),expected)
                self.assertTrue(all(p['violations']==0 for p in result['historicalCheckCompatibility']['profiles']))
                self.assertEqual((result['appRls'],result['appSelect'],result['appExecute']),(7,7,3))
                self.assertEqual((result['lineageRelationsChecked'],result['lineageOrphans']),(7,0))
                self.assertTrue(all(result['cleanup'].values()))
                self.assertFalse(result['fullBusinessDataAcceptance'])
                self.assertEqual(list(Path(directory).iterdir()),[])
                print('PUBLIC_HISTORICAL_COMPATIBILITY='+json.dumps({
                    'fixture':'GENERATED_PUBLIC_STRUCTURAL_STUBS_NOT_REAL_APP',
                    'invalidConstraints':result['invalidConstraints'],
                    'historicalCheckCompatibility':result['historicalCheckCompatibility'],
                    'appRls':result['appRls'],'appSelect':result['appSelect'],'appExecute':result['appExecute'],
                    'lineageRelationsChecked':result['lineageRelationsChecked'],'lineageOrphans':result['lineageOrphans'],
                    'cleanup':result['cleanup']},sort_keys=True))

    def test_public_not_valid_violating_rows_still_fail_closed_and_cleanup(self):
        for case in ('violating_rows',):
            with self.subTest(case=case), tempfile.TemporaryDirectory(prefix='t17-diagnostic-',dir='/tmp') as directory:
                os.chmod(directory,0o700)
                archive=public_archive(directory,large_rows=2,not_valid_case=case)
                def replay(consume):
                    for offset in range(0,len(archive),16384):consume(archive[offset:offset+16384])
                with self.assertRaisesRegex(engine.RestoreEngineRejected,'^lineage_structure_rejected$') as caught:
                    engine.restore_owned_database(replay,Path(directory))
                observation=diagnostic_after_cleanup(caught.exception)
                self.assertIsNotNone(observation)
                self.assertEqual(observation['phase'],PHASE)
                self.assertEqual(observation['invalidConstraints'],1)
                self.assertGreater(observation['foreignKeys'],0)
                self.assertEqual(observation['byContype']['c']['unvalidated'],1)
                self.assertEqual(observation['knownLegacyPaidContentCheck'],{'matches':1,'unvalidated':1})
                self.assertEqual(observation['historicalCheckCompatibility']['totalUnvalidated'],1)
                self.assertEqual(getattr(caught.exception,'historical_check_compatibility',None),
                                 observation['historicalCheckCompatibility'])
                paid=next(p for p in observation['historicalCheckCompatibility']['profiles'] if p['id']=='paid_content_v4')
                self.assertEqual(paid['violations'],1)
                self.assertTrue(all(observation['cleanup'].values()))
                encoded=json.dumps(observation,sort_keys=True)
                for forbidden in ('candidate_research_dossiers','candidate_research_dossiers_paid_content_check',
                                  'investanchors','SAFE_PUBLIC_FIXTURE','SELECT','"content"','source_run_ledger'):
                    self.assertNotIn(forbidden,encoded)
                self.assertEqual(list(Path(directory).iterdir()),[])
                print('PUBLIC_NOT_VALID_DIAGNOSTIC='+encoded)

    def test_projection_refuses_strings_bool_unknown_keys_and_inconsistent_counts(self):
        self.assertEqual(project_constraint_diagnostics(public_counts()),public_counts())
        mutations=[]
        for field in ('invalidConstraints','foreignKeys'):
            for value in (True,-1,8*1024**3+1,'PRIVATE_ROW_OR_SQL'):
                row=public_counts();row[field]=value;mutations.append(row)
        row=public_counts();row['name']='PRIVATE_NAME';mutations.append(row)
        row=public_counts();row['phase']='PRIVATE_PHASE';mutations.append(row)
        row=public_counts();row['byContype']['PRIVATE_TYPE']={'total':1,'unvalidated':0};mutations.append(row)
        row=public_counts();row['byContype']['c']['unvalidated']=2;mutations.append(row)
        row=public_counts();row['knownLegacyPaidContentCheck']['matches']=2;mutations.append(row)
        for row in mutations:
            self.assertIsNone(project_constraint_diagnostics(row))

    def test_failed_or_unknown_cleanup_never_claimed_safe(self):
        error=engine.RestoreEngineRejected('lineage_structure_rejected')
        error.constraint_diagnostics=public_counts()
        self.assertIsNone(diagnostic_after_cleanup(error))
        for value in (False,1,'true'):
            error.diagnostic_cleanup={'postmasterReaped':True,'socketRemoved':value,'privateTreeRemoved':True}
            self.assertIsNone(diagnostic_after_cleanup(error))
        error.diagnostic_cleanup={'postmasterReaped':True,'socketRemoved':True,'privateTreeRemoved':True}
        self.assertIsNotNone(diagnostic_after_cleanup(error))


if __name__=='__main__':unittest.main()

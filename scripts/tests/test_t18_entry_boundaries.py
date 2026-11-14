"""Fixed CLI/kernel refusal and privacy projections; no mock runtime grants."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from deployment.staging.vnext.t17_keyfd import portable_restore_engine as e
from deployment.staging.vnext.t17_keyfd.t18_receipt import project_exercise,project_three_uid_budget
from deployment.staging.vnext.t17_keyfd.t18_reader_roles import ROLE_COUNTS
from deployment.staging.vnext.t17_keyfd.fixed_read_proxy import METRICS
from deployment.staging.vnext.t17_keyfd.t18_release_assets import RELEASE_PINS
from deployment.staging.vnext.t17_keyfd.t18_host_plan import project_broker_refusal
from test_t17_portable_restore_engine import public_archive


def public_exercise():
    observation={'requiredColumns':11,'matchingColumns':11,'missingColumns':0,'typeMismatchColumns':0,
        'matchingTables':2,'homeValidSnapshots':1,'dailyValidSnapshots':1,'staleSnapshots26h':2,
        'missingContentDates':0,'status':'OBSERVED_PUBLISHED_SNAPSHOT','rowObservation':'COUNTS_AND_DATES_ONLY',
        'oldestContentDate':'2026-09-19','newestContentDate':'2026-09-19','readOnly':True,'appAcceptance':False}
    def health(index):
        return {'sourceCommit':RELEASE_PINS[index][0],'buildId':'PUBLIC_FIXTURE_'+str(index),'nextVersion':'16.3.4',
            'homeStatus':200,'homeBytes':2,'homeAcceptance':'HTTP_LIVENESS_ONLY',
            'dailyAcceptance':'STALE_READONLY_ORIGINAL_DATE_NO_AUTHORITY','staticStatus':200,'staticSha256':'a'*64,
            'dailyBytes':2,'dailySha256':'b'*64,'contentDate':'2026-09-19','snapshotPublishedDate':'2026-09-19',
            'staleReadonly':True,'actionsEnabled':False}
    return {'status':'FIXED_OLD_RELEASE_DAILY_ROLLBACK_VERIFIED','readerObservation':observation,
        'readerRoleChecks':dict(ROLE_COUNTS),'negativeHttpChecks':{'proxyDenied':6,'postgrestDenied':2},
        'proxyMetrics':{k:0 for k in METRICS},'rollback':{'sequence':'A_B_A','steps':[health(0),health(1),health(0)],
        'faultHealthFailed':True,'automaticRollback':'A','recovered':health(0)},
        'snapshotDataAndConstraintBitsUnchanged':True,'postgrestAcceptance':'FIXED_READER_ONLY',
        'nextRollback':'FIXED_OLD_PAIR_VERIFIED','newRadarReleaseAcceptance':'NOT_RUN',
        'stockDetailAcceptance':'NOT_RUN_TWO_TABLE_SCOPE','homeAcceptance':'HTTP_LIVENESS_ONLY',
        'fullBusinessDataAcceptance':False,'namespaceKernelCookiesMatched':True,'threeDistinctOsUidsObserved':True,
        'ownedListenersClosed':True,'hostUnitCleanup':'HOST_REQUIRED'}


class FixedT18EntryBoundariesTests(unittest.TestCase):
    def test_output_rejects_unknown_payload_counts_dates_and_namespace_id(self):
        original=public_exercise();self.assertEqual(project_exercise(original),original)
        bad=[]
        row=copy.deepcopy(original);row['payload']='DO_NOT_EXPORT_PUBLIC_FIXTURE';bad.append(row)
        row=copy.deepcopy(original);row['networkNamespaceCookie']=2;bad.append(row)
        for value in (True,-1,8*1024**3+1,'DO_NOT_EXPORT'):
            row=copy.deepcopy(original);row['proxyMetrics']['requests']=value;bad.append(row)
        row=copy.deepcopy(original);row['rollback']['steps'][0]['contentDate']='2026-02-30';bad.append(row)
        row=copy.deepcopy(original);row['rollback']['steps'][1]['sourceCommit']=RELEASE_PINS[0][0];bad.append(row)
        row=copy.deepcopy(original);row['readerRoleChecks']['writePrivileges']=True;bad.append(row)
        row=copy.deepcopy(original);row['rollback']['recovered']['actionsEnabled']=True;bad.append(row)
        for value in bad:self.assertIsNone(project_exercise(value))

    def test_budget_bool_or_unbounded_counts_cannot_reach_receipt(self):
        base={'databaseMemoryLimitBytes':768*1024**2,'appMemoryLimitBytes':512*1024**2,'restMemoryLimitBytes':256*1024**2,
            'hostAvailableMemoryBytes':4*1024**3,'reservedHostMemoryBytes':1536*1024**2,
            'swapLimitBytes':0,'distinctBoundedCgroupsObserved':True}
        self.assertEqual(project_three_uid_budget(base),base)
        for val in (True,8*1024**3+1,'DO_NOT_EXPORT'):
            row=dict(base,hostAvailableMemoryBytes=val);self.assertIsNone(project_three_uid_budget(row))

    def test_all_fixed_entries_refuse_actual_cloud_without_host_contract(self):
        root=Path(__file__).resolve().parents[2]
        for script,args in (('staging_restore_next_rollback.py',['--work-root','/run/t18-db-work']),
            ('staging_t18_app_broker.py',[]),('staging_t18_rest_broker.py',[])):
            p=subprocess.run([sys.executable,'-I','-B',str(root/'scripts'/script),*args],
                env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},capture_output=True,timeout=10)
            self.assertEqual(p.returncode,2);self.assertEqual(p.stderr,b'')
            if 'restore' in script:
                value=json.loads(p.stdout);self.assertEqual(value['status'],'REJECTED')
                self.assertFalse(value['databaseRestored']);self.assertTrue(value['nativeHoldRetained'])
            else:
                role='APP' if script=='staging_t18_app_broker.py' else 'REST'
                observed=project_broker_refusal(p.stdout,role)
                self.assertIsNotNone(observed)
                self.assertTrue(observed['tag'].startswith('namespace_'))

    def test_actual_pg_fast_shutdown_cancels_open_client_and_cleans(self):
        with tempfile.TemporaryDirectory(prefix='t18-pg-cleanup-',dir='/tmp') as directory:
            os.chmod(directory,0o700);archive=public_archive(directory,large_rows=2)
            def replay(consume):consume(archive)
            client=None
            try:
                with e._owned_validated_clone(replay,Path(directory)):
                    pg,_=e._tools();sock=next(Path(directory).glob('t17-owned-restore-*/socket'))
                    env={'PATH':str(pg)+':/usr/bin:/bin','LC_ALL':'C','PGHOST':str(sock),'PGPORT':'6551',
                        'PGDATABASE':'t17_restored','PGUSER':__import__('pwd').getpwuid(os.getuid()).pw_name,
                        'PGPASSFILE':'/dev/null','PGSERVICEFILE':'/dev/null'}
                    client=subprocess.Popen([str(pg/'psql'),'-X','-q','-c','SELECT pg_sleep(60)'],env=env,
                        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                    time.sleep(.15)
                self.assertNotEqual(client.wait(timeout=3),0)
                self.assertEqual(list(Path(directory).iterdir()),[])
            finally:
                if client and client.poll() is None:client.kill();client.wait(timeout=3)


if __name__=='__main__':unittest.main()

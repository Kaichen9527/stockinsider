"""Runnable DB-only Linux staging restore, fixed capability FDs, no live flag.

Host provisions sandbox and passes key3/cipher4/manifest5/lock6/hostdir7/image8.
This NEW entry is distinct from all historical disabled facades. No production
socket/DB/service/writer/timer is addressed; external acceptance stays separate.
"""
import argparse
import ctypes
import json
import os
from pathlib import Path
import resource
import re
import signal
import time
from .staging_admission import observe_staging, StagingAdmissionRejected
from .verified_backup_stream import (
    owned_staging_key, read_manifest, VerifiedBackupStream, BackupStreamRejected)
from .portable_restore_engine import restore_owned_database, RestoreEngineRejected
from .constraint_diagnostics import diagnostic_after_cleanup
from .historical_check_profiles import require_historical_check_profiles, HistoricalCheckRejected


def protect_key_process():
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    libc=ctypes.CDLL(None,use_errno=True)
    # Untrusted restored SQL executes under the PG OS UID, often our same UID.
    # Do not let it ptrace/open parent process memory while this parent owns key.
    if libc.prctl(4,0,0,0,0)!=0 or libc.prctl(3,0,0,0,0)!=0:
        raise StagingAdmissionRejected('nondumpable_parent_required')
    if libc.prctl(38,1,0,0,0)!=0 or libc.prctl(39,0,0,0,0)!=1:
        raise StagingAdmissionRejected('no_new_privileges_required')


def _validate_receipt_counts(database):
    # A SQL archive executes as DB superuser; do not relay arbitrary strings
    # from verification JSON in fields promised to be sanitized numeric counts.
    for name in ('databaseBytes','publicTables','rlsTables','policies','foreignKeys',
                 'maxRelationBytes','invalidConstraints','lineageRelationsChecked',
                 'lineageOrphans','appRls','appSelect','appExecute'):
        if type(database.get(name)) is not int or not 0<=database[name]<=8*1024**3:
            raise RestoreEngineRejected('sanitized_count_contract_rejected')
    try:
        historical=require_historical_check_profiles(database.get('historicalCheckCompatibility'))
        if historical['totalUnvalidated']!=database['invalidConstraints']:
            raise HistoricalCheckRejected()
    except HistoricalCheckRejected:
        raise RestoreEngineRejected('sanitized_historical_check_contract_rejected') from None
    if not re.fullmatch(r'17[0-9]{4}',str(database.get('serverVersionNum',''))):
        raise RestoreEngineRejected('sanitized_version_contract_rejected')


def execute_staging_database_restore(work_root):
    """Actual observation -> authenticate -> owned restore; never caller flags."""
    protect_key_process()
    observations=observe_staging(work_root)  # actual OS, fixed FDs6/7/8
    manifest=read_manifest(5)  # private bounded capture; sourceFD closes
    # Host image is already preallocated/charged; reserve is OUTSIDE this image.
    # No plaintext archive/ciphertext copy is written into the8GiB work volume.
    required=manifest['databaseBytes']+1024**3+512*1024**2+2*1024**3+128*1024**2
    if observations['workFreeBytes']<required:
        raise StagingAdmissionRejected('database_wal_scratch_growth_capacity')
    with owned_staging_key(3) as key:
        with VerifiedBackupStream(4,manifest,key) as backup:
            backup.authenticate()  # wrongkey/tag/digest never starts ANY PG child
            database=restore_owned_database(backup.replay,Path(work_root))
            _validate_receipt_counts(database)
            return {'schema':'stockinsider-staging-database-restore-v1',
                    'status':'DB_RESTORE_VERIFIED','observations':observations,
                    'manifestSchema':manifest['schema'],
                    'authenticatedPlaintextBytes':manifest['plaintextBytes'],
                    'authenticatedPlaintextSha256':manifest['plaintextSha256'],
                    'ciphertextSha256':backup.ciphertextSha256,
                    'immutableCustody':backup.kind,'database':database,
                    'providerRecovery':'NOT_RUN','nextRollback':'NOT_RUN',
                    'serviceActivation':'NOT_RUN','productionContinuity':'HOST_REQUIRED',
                    'nativeHoldRetained':True,
                    'fullReleaseAcceptance':False}


def main():
    parser=argparse.ArgumentParser(description='Dedicated Linux staging DB restore only')
    parser.add_argument('--work-root',required=True)
    args=parser.parse_args()
    started=time.monotonic()
    def stop(*_):
        # Let bounded owned-child cleanup finish despite repeated soft stops.
        signal.alarm(0)
        for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGALRM):
            signal.signal(sig,signal.SIG_IGN)
        raise TimeoutError()
    signal.signal(signal.SIGTERM,stop)
    signal.signal(signal.SIGINT,stop)
    signal.signal(signal.SIGALRM,stop)
    signal.alarm(1200)
    receipt=None
    try:
        receipt=execute_staging_database_restore(args.work_root)
        code=0
    except (StagingAdmissionRejected,BackupStreamRejected,RestoreEngineRejected) as error:
        receipt={'schema':'stockinsider-staging-database-restore-v1',
                 'status':'REJECTED','reason':str(error),'databaseRestored':False,
                 'nativeHoldRetained':True}
        if isinstance(error,RestoreEngineRejected) and str(error)=='lineage_structure_rejected':
            diagnostic=diagnostic_after_cleanup(error)
            if diagnostic is not None:
                receipt['constraintDiagnostics']=diagnostic
        code=2
    except BaseException:
        receipt={'schema':'stockinsider-staging-database-restore-v1',
                 'status':'FAILED','reason':'restore_interrupted_or_system_failure',
                 'databaseRestored':False,'nativeHoldRetained':True}
        code=2
    finally:
        signal.alarm(0)
        # Engine must have stopped/reaped before EX host lock is released LAST.
        for fd in (3,4,5,8,7,6):
            try:os.close(fd)
            except OSError:pass
    receipt['durationSeconds']=round(time.monotonic()-started,3)
    print(json.dumps(receipt,sort_keys=True))
    return code

"""Fixed three-UID staging old-release daily rollback; no URL/command option."""
import argparse
import json
import os
import pwd
import stat
from pathlib import Path
import signal
import time
from .stage_database_restore import _authenticated_staging_backup,_validate_receipt_counts,protect_key_process
from .portable_restore_engine import rehearse_owned_fixed_next,RestoreEngineRejected
from .constraint_diagnostics import diagnostic_after_cleanup
from .staging_admission import StagingAdmissionRejected,_namespace_and_privileges
from .verified_backup_stream import BackupStreamRejected
from .t18_release_assets import ReleaseAssetsRejected,RELEASE_PINS,NODE_SHA256,POSTGREST_SHA256
from .t18_broker_transport import BrokerTransportRejected
from .t18_runtime_observation import ThreeUidBudgetRejected
from .t18_receipt import project_exercise,project_three_uid_budget


def _wait_fixed_broker_sockets():
    # Scheduling only: root seals these sockets while the DB unit already owns
    # its network namespace. Actual SO_PEERCRED/group/cookie admission follows;
    # pathname existence is never execution authority. No key is read yet.
    for _ in range(150):
        ready=True
        for path in ('/run/t18-broker/control.sock','/run/t18-rest/control.sock'):
            try:
                info=os.lstat(path)
                if not stat.S_ISSOCK(info.st_mode) or info.st_uid!=0:ready=False
            except (FileNotFoundError,PermissionError):ready=False
        if ready:return
        time.sleep(.1)
    raise StagingAdmissionRejected('fixed_t18_broker_startup_timeout')


def execute_staging_next_rollback(work_root):
    if str(work_root)!='/run/t18-db-work':
        raise StagingAdmissionRejected('fixed_t18_work_root_required')
    if pwd.getpwuid(os.getuid()).pw_name!='si-t18-db':raise StagingAdmissionRejected('fixed_t18_db_uid_required')
    protect_key_process();_namespace_and_privileges();_wait_fixed_broker_sockets()
    with _authenticated_staging_backup(work_root) as (observations,manifest,backup):
        result=rehearse_owned_fixed_next(backup.replay,Path(work_root))
        _validate_receipt_counts(result['database'])
        exercise=project_exercise(result.get('exercise'));budget=project_three_uid_budget(result.get('threeUidBudget'))
        if exercise is None or budget is None:raise RestoreEngineRejected('sanitized_t18_receipt_rejected')
        result['exercise']=exercise;result['threeUidBudget']=budget
        return {'schema':'stockinsider-staging-next-rollback-v1','status':('DB_VERIFIED_T18_GAP' if exercise['status']=='GAP_GENUINE_SNAPSHOT_OR_SCHEMA' else 'DB_VERIFIED_FIXED_T18_EXERCISED'),
            'observations':observations,**result,'manifestSchema':manifest['schema'],
            'authenticatedPlaintextBytes':manifest['plaintextBytes'],
            'authenticatedPlaintextSha256':manifest['plaintextSha256'],
            'ciphertextSha256':backup.ciphertextSha256,'immutableCustody':backup.kind,
            'fixedManifestBindings':[{'sourceCommit':commit,'manifestSha256':pin} for commit,pin in RELEASE_PINS],
            'nodeSha256':NODE_SHA256,'postgrestSha256':POSTGREST_SHA256,
            'nativeHoldRetained':True,'providerRecovery':'NOT_RUN',
            'stockDetailAcceptance':'NOT_RUN_TWO_TABLE_SCOPE','newRadarReleaseAcceptance':'NOT_RUN',
            'productionContinuity':'HOST_REQUIRED','fullReleaseAcceptance':False}


def main():
    parser=argparse.ArgumentParser(description='Fixed staging old-release daily rollback only')
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
        receipt=execute_staging_next_rollback(args.work_root)
        code=3 if receipt['status']=='DB_VERIFIED_T18_GAP' else 0
    except (StagingAdmissionRejected,BackupStreamRejected,RestoreEngineRejected,ReleaseAssetsRejected,BrokerTransportRejected,ThreeUidBudgetRejected) as error:
        receipt={'schema':'stockinsider-staging-next-rollback-v1',
                 'status':'REJECTED','reason':str(error),'databaseRestored':False,
                 'nativeHoldRetained':True}
        if isinstance(error,RestoreEngineRejected) and str(error)=='lineage_structure_rejected':
            diagnostic=diagnostic_after_cleanup(error)
            if diagnostic is not None:
                receipt['constraintDiagnostics']=diagnostic
        code=2
    except BaseException:
        receipt={'schema':'stockinsider-staging-next-rollback-v1',
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

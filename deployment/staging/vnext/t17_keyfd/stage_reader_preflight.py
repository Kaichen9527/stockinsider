"""Fixed staging reader observation before clone cleanup, never app activation.

This is a separate workflow with the same actual OS/FD/key/immutable-source
admission as T17. A receipt/Boolean/callback supplies no execution authority.
No PostgREST/Next process, role creation, credential inheritance or row payload.
"""
import argparse
import json
from pathlib import Path
import os
import signal
import time
from .stage_database_restore import _authenticated_staging_backup, _validate_receipt_counts
from .staging_admission import StagingAdmissionRejected
from .verified_backup_stream import BackupStreamRejected
from .portable_restore_engine import observe_owned_radar_reader, RestoreEngineRejected
from .constraint_diagnostics import diagnostic_after_cleanup
from .radar_reader_observation import project_radar_reader_observation


def execute_staging_reader_preflight(work_root):
    with _authenticated_staging_backup(work_root) as (observations,manifest,backup):
        result=observe_owned_radar_reader(backup.replay,Path(work_root))
        _validate_receipt_counts(result['database'])
        observation=project_radar_reader_observation(result.get('readerObservation'))
        if observation is None:
            raise RestoreEngineRejected('sanitized_reader_observation_rejected')
        result['readerObservation']=observation
        return {'schema':'stockinsider-staging-reader-preflight-v1',
                'status':'DB_VERIFIED_READER_OBSERVED','observations':observations,
                'manifestSchema':manifest['schema'],
                'authenticatedPlaintextBytes':manifest['plaintextBytes'],
                'authenticatedPlaintextSha256':manifest['plaintextSha256'],
                'ciphertextSha256':backup.ciphertextSha256,
                'immutableCustody':backup.kind,**result,
                'postgrestAcceptance':'NOT_RUN','nextRollback':'NOT_RUN',
                'rankingHealth':'NOT_ACCEPTED','genuineSnapshotAcceptance':'ONSITE_REQUIRED',
                'serviceActivation':'NOT_RUN','productionContinuity':'HOST_REQUIRED',
                'nativeHoldRetained':True,'fullReleaseAcceptance':False}


def main():
    parser=argparse.ArgumentParser(description='Dedicated staging restored-radar reader observation only')
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
        receipt=execute_staging_reader_preflight(args.work_root)
        code=0
    except (StagingAdmissionRejected,BackupStreamRejected,RestoreEngineRejected) as error:
        receipt={'schema':'stockinsider-staging-reader-preflight-v1',
                 'status':'REJECTED','reason':str(error),'databaseRestored':False,
                 'nativeHoldRetained':True}
        if isinstance(error,RestoreEngineRejected) and str(error)=='lineage_structure_rejected':
            diagnostic=diagnostic_after_cleanup(error)
            if diagnostic is not None:
                receipt['constraintDiagnostics']=diagnostic
        code=2
    except BaseException:
        receipt={'schema':'stockinsider-staging-reader-preflight-v1',
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

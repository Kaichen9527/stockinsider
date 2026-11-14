"""Closed, descriptive error labels. No SQL, rows, logs, tokens or exception text."""
from contextlib import contextmanager
import json
import subprocess
from .stage_credentials import StageCredentialRejected

PHASES=frozenset(('radar_readpoint','snapshot_fingerprint','snapshot_dates','reader_role_install',
 'owned_socket_activation','initial_app_shutdown','stage_credential_handoff','stage_credential_lifetime',
 'fresh_app_binding','port_preconditions','rest_configure','app_configure','fixed_http_exercise',
 'final_token_check','broker_cleanup','snapshot_final_check','candidate_detail_query','candidate_detail_prepare','candidate_detail_http'))
CLASSES=frozenset(('stage_lifetime','stage_material','stage_handoff','timeout','os_error','parse_error','rejected','unexpected'))


class ReadpointRejected(Exception):
    def __init__(self,phase,kind):
        self.diagnostic={'phase':phase,'errorClass':kind}
        super().__init__('t18_'+phase+'_failed')


@contextmanager
def readpoint_phase(phase):
    if phase not in PHASES:raise ValueError('fixed_diagnostic_phase_rejected')
    try:yield
    except ReadpointRejected:raise
    except Exception as error:
        if isinstance(error,StageCredentialRejected):
            kind='stage_'+error.category
            if error.category=='lifetime':phase='stage_credential_lifetime'
        elif isinstance(error,(TimeoutError,subprocess.TimeoutExpired)):kind='timeout'
        elif isinstance(error,OSError):kind='os_error'
        elif isinstance(error,(json.JSONDecodeError,UnicodeError)):kind='parse_error'
        else:
            from .t18_reader_roles import FixedReaderRolesRejected
            from .t18_broker_transport import BrokerTransportRejected
            from .t18_same_clone import FixedRollbackRejected
            from .t18_app_broker import AppBrokerRejected
            from .portable_restore_engine import RestoreEngineRejected
            from .candidate_detail_observation import CandidateDetailObservationRejected
            kind='rejected' if isinstance(error,(FixedReaderRolesRejected,BrokerTransportRejected,FixedRollbackRejected,AppBrokerRejected,RestoreEngineRejected,CandidateDetailObservationRejected)) else 'unexpected'
        raise ReadpointRejected(phase,kind) from None


def project_readpoint_diagnostic(value):
    if (type(value) is not dict or set(value)!={'phase','errorClass'}
        or type(value['phase']) is not str or value['phase'] not in PHASES
        or type(value['errorClass']) is not str or value['errorClass'] not in CLASSES):return None
    return {'phase':value['phase'],'errorClass':value['errorClass']}


def readpoint_after_cleanup(error):
    result=project_readpoint_diagnostic(getattr(error,'readpoint_diagnostic',None))
    cleanup=getattr(error,'diagnostic_cleanup',None)
    if (result is None or type(cleanup) is not dict
        or set(cleanup)!={'postmasterReaped','socketRemoved','privateTreeRemoved'}
        or any(type(v) is not bool or not v for v in cleanup.values())):return None
    return {**result,'ownedCloneCleanupVerified':True}

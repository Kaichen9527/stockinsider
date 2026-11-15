"""Closed, descriptive error labels. No SQL, rows, logs, tokens or exception text."""
from contextlib import contextmanager
from contextvars import ContextVar
import json
import subprocess
from .stage_credentials import StageCredentialRejected

PHASES=frozenset(('radar_readpoint','snapshot_fingerprint','snapshot_dates','reader_role_install',
 'owned_socket_activation','initial_app_shutdown','stage_credential_handoff','stage_credential_lifetime',
 'fresh_app_binding','port_preconditions','rest_configure','app_configure','fixed_http_exercise',
 'final_token_check','broker_cleanup','snapshot_final_check','candidate_detail_query','candidate_detail_prepare','candidate_detail_http'))
CLASSES=frozenset(('stage_lifetime','stage_material','stage_handoff','timeout','os_error','parse_error','rejected','unexpected'))
HTTP_STEPS=('aba_first_a','aba_b','aba_return_a','fault_b','rollback_a')
HTTP_SUBPHASES=frozenset(('proxy_start','proxy_stop','proxy_denial_probes','rest_target_readiness','rest_denial_probes',
 'fault_inject','fault_observe','sequence_final_stop','detail_final_stop','app_broker_shutdown','rest_broker_shutdown',
 'broker_ports_closed','app_transport_close')+tuple(s+'_'+op for s in HTTP_STEPS for op in ('start','stop','static_select','daily','home','static'))
 +tuple(s+'_'+op for s in ('detail_a','detail_b') for op in ('start','api','payload','page','page_markup','page_link_markup','page_links_changed','page_links_missing',
  'page_links_unexpected','page_identity','page_sections','page_prose','page_dates','identity','stop')))
HTTP_COMPLETED=('detailPreparationCompleted','detailReadPrepared','detailPreparationGap','detailBoundsGap','proxyStarted','proxyStopped',
 'proxyDenialsPassed','restTargetResponded','restDenialsPassed','firstAHealthPassed','bHealthPassed','returnAHealthPassed',
 'faultBReady','faultObserved','rollbackAHealthPassed','detailHttpPassed','appShutdownAcknowledged','restShutdownAcknowledged','appTransportClosed')
_HTTP_TRACE=ContextVar('fixed_http_diagnostic_trace',default=None)
_HTTP_SUBPHASE=ContextVar('fixed_http_diagnostic_subphase',default=None)


def http_completed(stage):
    if type(stage) is not str or stage not in HTTP_COMPLETED:raise ValueError('fixed_completion_stage_rejected')
    state=_HTTP_TRACE.get()
    if state is not None:state['completed'][stage]=True


@contextmanager
def http_trace():
    token=_HTTP_TRACE.set({'started':False,'completed':dict.fromkeys(HTTP_COMPLETED,False)})
    try:yield
    except ReadpointRejected as error:
        # Cleanup completion may be added, but never replace the earliest error.
        if 'completedStages' in error.diagnostic:
            error.diagnostic['completedStages']=dict(_HTTP_TRACE.get()['completed'])
        raise
    finally:_HTTP_TRACE.reset(token)


@contextmanager
def http_subphase(label):
    if type(label) is not str or label not in HTTP_SUBPHASES:raise ValueError('fixed_http_subphase_rejected')
    state=_HTTP_TRACE.get()
    if state is None:yield;return
    state['started']=True;token=_HTTP_SUBPHASE.set(label)
    try:
        with readpoint_phase('candidate_detail_http' if label.startswith('detail_') else 'fixed_http_exercise'):yield
    finally:_HTTP_SUBPHASE.reset(token)


class ReadpointRejected(Exception):
    def __init__(self,phase,kind):
        if type(phase) is not str or phase not in PHASES or type(kind) is not str or kind not in CLASSES:raise ValueError('fixed_readpoint_diagnostic_rejected')
        self.diagnostic={'phase':phase,'errorClass':kind}
        state=_HTTP_TRACE.get();label=_HTTP_SUBPHASE.get()
        if state is not None and state['started']:
            self.diagnostic['completedStages']=dict(state['completed'])
            if label is not None:self.diagnostic['httpSubphase']=label
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
            from .fixed_read_proxy import FixedReadProxyRejected
            kind='rejected' if isinstance(error,(FixedReaderRolesRejected,BrokerTransportRejected,FixedRollbackRejected,AppBrokerRejected,RestoreEngineRejected,CandidateDetailObservationRejected,FixedReadProxyRejected)) else 'unexpected'
            if ((type(error) is BrokerTransportRejected and error.args==('broker_ipc_deadline',))
                or (type(error) is FixedRollbackRejected and error.args==('fixed_rollback_deadline',))):kind='timeout'
        raise ReadpointRejected(phase,kind) from None


def project_readpoint_diagnostic(value):
    if (type(value) is not dict or set(value) not in ({'phase','errorClass'},{'phase','errorClass','completedStages'},{'phase','errorClass','httpSubphase','completedStages'})
        or type(value['phase']) is not str or value['phase'] not in PHASES
        or type(value['errorClass']) is not str or value['errorClass'] not in CLASSES):return None
    result={'phase':value['phase'],'errorClass':value['errorClass']}
    if 'completedStages' in value:
        flags=value['completedStages']
        if (value['phase'] not in ('fixed_http_exercise','candidate_detail_http','final_token_check','broker_cleanup','stage_credential_lifetime')
            or type(flags) is not dict or set(flags)!=set(HTTP_COMPLETED) or any(type(v) is not bool for v in flags.values())):return None
        result['completedStages']={k:flags[k] for k in HTTP_COMPLETED}
    if 'httpSubphase' in value:
        label=value['httpSubphase']
        if (type(label) is not str or label not in HTTP_SUBPHASES
            or (value['phase']!=('candidate_detail_http' if label.startswith('detail_') else 'fixed_http_exercise')
                and not (value['phase']=='stage_credential_lifetime' and value['errorClass']=='stage_lifetime'))):return None
        result['httpSubphase']=label
    return result


def readpoint_after_cleanup(error):
    result=project_readpoint_diagnostic(getattr(error,'readpoint_diagnostic',None))
    cleanup=getattr(error,'diagnostic_cleanup',None)
    if (result is None or type(cleanup) is not dict
        or set(cleanup)!={'postmasterReaped','socketRemoved','privateTreeRemoved'}
        or any(type(v) is not bool or not v for v in cleanup.values())):return None
    return {**result,'ownedCloneCleanupVerified':True}

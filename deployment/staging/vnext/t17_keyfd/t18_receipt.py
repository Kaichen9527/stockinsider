"""Second output boundary for the fixed T18 exercise; never runtime authority."""
import datetime
import re
from .radar_reader_observation import project_radar_reader_observation
from .t18_reader_roles import ROLE_COUNTS,LAUNCH_ROLE_COUNTS
from .fixed_read_proxy import METRICS
from .t18_release_assets import RELEASE_PINS,LAUNCH_RELEASE_PINS
from .t18_same_clone import project_launch_migration_markers
from .t18_core_migration_rehearsal import project_core_rehearsal

MAX_COUNT=8*1024**3
HEALTH_KEYS=set('sourceCommit buildId nextVersion homeStatus homeBytes homeAcceptance dailyAcceptance staticStatus staticSha256 dailyBytes dailySha256 contentDate snapshotPublishedDate staleReadonly actionsEnabled'.split())


def _count(value):return type(value) is int and 0<=value<=MAX_COUNT

def _health(value,commit):
    if type(value) is not dict or set(value)!=HEALTH_KEYS or value['sourceCommit']!=commit:return None
    if type(value['buildId']) is not str or not re.fullmatch('[A-Za-z0-9_-]{1,256}',value['buildId']):return None
    fixed={'nextVersion':'16.3.4','homeStatus':200,'homeAcceptance':'HTTP_LIVENESS_ONLY',
        'dailyAcceptance':'STALE_READONLY_ORIGINAL_DATE_NO_AUTHORITY','staticStatus':200,
        'staleReadonly':True,'actionsEnabled':False}
    if any(type(value[k]) is not type(v) or value[k]!=v for k,v in fixed.items()):return None
    if any(not _count(value[k]) or value[k]>2*1024**2 for k in ('homeBytes','dailyBytes')):return None
    if any(type(value[k]) is not str or not re.fullmatch('[0-9a-f]{64}',value[k]) for k in ('staticSha256','dailySha256')):return None
    for key in ('contentDate','snapshotPublishedDate'):
        date=value[key]
        if type(date) is not str or len(date)!=10:return None
        try:
            if datetime.date.fromisoformat(date).isoformat()!=date:return None
        except ValueError:return None
    return {k:value[k] for k in HEALTH_KEYS}


def _project_launch_readpoint(value):
    if type(value) is not dict or set(value)!={'status','session','ranked'}:return None
    status,date,count=value['status'],value['session'],value['ranked']
    if status in ('SCHEMA_MISSING','PRODUCER_DISABLED'):
        return dict(value) if date is None and count is None else None
    if status=='NOT_PUBLISHED':
        return dict(value) if date is None and type(count) is int and count==0 else None
    if status not in ('TOP_ZERO','FROZEN_RANK_ROWS_OBSERVED','RANK_BINDING_INVALID'):
        return None
    if type(date) is not str or len(date)!=10:return None
    try:
        if datetime.date.fromisoformat(date).isoformat()!=date:return None
    except ValueError:return None
    if status=='RANK_BINDING_INVALID':
        return dict(value) if count is None else None
    if type(count) is not int or not 0<=count<=10 or (count==0)!=(status=='TOP_ZERO'):return None
    return dict(value)


_LAUNCH_EXERCISE_CONSTANTS={'status':'FIXED_LAUNCH_RELEASE_ROLLBACK_VERIFIED',
    'snapshotDataAndConstraintBitsUnchanged':True,'postgrestAcceptance':'FIXED_LAUNCH_READER_ONLY',
    'nextRollback':'FIXED_LAUNCH_PAIR_VERIFIED','namespaceKernelCookiesMatched':True,
    'threeDistinctOsUidsObserved':True,'ownedListenersClosed':True,'hostUnitCleanup':'HOST_REQUIRED'}


def _project_launch_exercise(value):
    if set(value)!=set(_LAUNCH_EXERCISE_CONSTANTS)|{'launchReadpoint','readerRoleChecks','negativeHttpChecks','proxyMetrics','rollback'}:
        return None
    if any(type(value[k]) is not type(v) or value[k]!=v for k,v in _LAUNCH_EXERCISE_CONSTANTS.items()):return None
    observed=_project_launch_readpoint(value['launchReadpoint'])
    if observed is None or observed['status']!='FROZEN_RANK_ROWS_OBSERVED':return None
    roles=value['readerRoleChecks']
    if (type(roles) is not dict or set(roles)!=set(LAUNCH_ROLE_COUNTS)
        or any(type(roles[k]) is not int or roles[k]!=v for k,v in LAUNCH_ROLE_COUNTS.items())):return None
    denied=value['negativeHttpChecks']
    if type(denied) is not dict or denied!={'proxyDenied':6,'postgrestDenied':2}:return None
    metrics=value['proxyMetrics']
    if (type(metrics) is not dict or set(metrics)!=set(METRICS) or any(not _count(v) for v in metrics.values())
        or metrics['allowedReads']<8 or metrics['blockedRequests']<6):return None
    result=value['rollback']
    if (type(result) is not dict or set(result)!={'sequence','steps','faultHealthFailed','automaticRollback','recovered'}
        or result['sequence']!='A_B_A' or result['faultHealthFailed'] is not True or result['automaticRollback']!='A'
        or type(result['steps']) is not list or len(result['steps'])!=3):return None
    fixed={'nextVersion':'16.3.4','homeStatus':200,'detailStatus':200,'staticStatus':200,
        'session':observed['session'],'ranked':observed['ranked']}
    steps=[*result['steps'],result['recovered']]
    for item,index in zip(steps,(0,1,0,0)):
        if (type(item) is not dict or set(item)!=set(fixed)|{'sourceCommit','buildId','staticSha256','snapshotSha256','detailSha256'}
            or item['sourceCommit']!=LAUNCH_RELEASE_PINS[index][0]
            or any(type(item[k]) is not type(v) or item[k]!=v for k,v in fixed.items())
            or type(item['buildId']) is not str or not re.fullmatch(r'[a-zA-Z0-9_-]{1,256}',item['buildId'])
            or any(type(item[k]) is not str or not re.fullmatch(r'[a-f0-9]{64}',item[k])
                for k in ('staticSha256','snapshotSha256','detailSha256'))):return None
    if (steps[0]!=steps[2] or steps[0]!=steps[3] or steps[0]['buildId']==steps[1]['buildId']
        or any(steps[0][k]!=steps[1][k] for k in ('snapshotSha256','detailSha256'))):return None
    return value


def project_exercise(value):
    if type(value) is not dict:return None
    if value.get('status')=='FIXED_LAUNCH_RELEASE_ROLLBACK_VERIFIED':return _project_launch_exercise(value)
    if value.get('status')=='LAUNCH_CLONE_READPOINT_ONLY':
        launch=_project_launch_readpoint(value.get('launchReadpoint'))
        if launch is None or value.get('postgrestAcceptance')!='NOT_RUN' or value.get('nextRollback')!='NOT_RUN':return None
        expected={'status','launchReadpoint','postgrestAcceptance','nextRollback'}
        if launch['status']=='SCHEMA_MISSING':
            expected.add('migrationPrerequisites')
            if project_launch_migration_markers(value.get('migrationPrerequisites')) is None:return None
            if 'coreMigrationRehearsal' in value:
                expected.add('coreMigrationRehearsal')
                if project_core_rehearsal(value['coreMigrationRehearsal']) is None:return None
        return {**value,'launchReadpoint':launch} if set(value)==expected else None
    observation=project_radar_reader_observation(value.get('readerObservation'))
    if observation is None:return None
    if value.get('status')=='GAP_GENUINE_SNAPSHOT_OR_SCHEMA':
        if set(value)!={'status','readerObservation','postgrestAcceptance','nextRollback'} or value['postgrestAcceptance']!='NOT_RUN' or value['nextRollback']!='NOT_RUN':return None
        return {**value,'readerObservation':observation}
    constants={'status':'FIXED_OLD_RELEASE_DAILY_ROLLBACK_VERIFIED','snapshotDataAndConstraintBitsUnchanged':True,
        'postgrestAcceptance':'FIXED_READER_ONLY','nextRollback':'FIXED_OLD_PAIR_VERIFIED',
        'newRadarReleaseAcceptance':'NOT_RUN','stockDetailAcceptance':'NOT_RUN_TWO_TABLE_SCOPE',
        'homeAcceptance':'HTTP_LIVENESS_ONLY','fullBusinessDataAcceptance':False,
        'namespaceKernelCookiesMatched':True,'threeDistinctOsUidsObserved':True,
        'ownedListenersClosed':True,'hostUnitCleanup':'HOST_REQUIRED'}
    if set(value)!=set(constants)|{'readerObservation','readerRoleChecks','negativeHttpChecks','proxyMetrics','rollback'}:return None
    if any(type(value[k]) is not type(v) or value[k]!=v for k,v in constants.items()):return None
    roles=value['readerRoleChecks']
    if type(roles) is not dict or set(roles)!=set(ROLE_COUNTS) or any(type(roles[k]) is not int or roles[k]!=v for k,v in ROLE_COUNTS.items()):return None
    negatives=value['negativeHttpChecks']
    if type(negatives) is not dict or set(negatives)!={'proxyDenied','postgrestDenied'} or type(negatives['proxyDenied']) is not int or type(negatives['postgrestDenied']) is not int or negatives!={'proxyDenied':6,'postgrestDenied':2}:return None
    metrics=value['proxyMetrics']
    if type(metrics) is not dict or set(metrics)!=set(METRICS) or any(not _count(v) for v in metrics.values()):return None
    rollback=value['rollback']
    if type(rollback) is not dict or set(rollback)!={'sequence','steps','faultHealthFailed','automaticRollback','recovered'}:return None
    if rollback['sequence']!='A_B_A' or rollback['faultHealthFailed'] is not True or rollback['automaticRollback']!='A':return None
    if type(rollback['steps']) is not list or len(rollback['steps'])!=3:return None
    commits=[RELEASE_PINS[i][0] for i in (0,1,0)]
    steps=[_health(item,commit) for item,commit in zip(rollback['steps'],commits)]
    recovered=_health(rollback['recovered'],commits[0])
    if any(item is None for item in steps) or recovered is None:return None
    return {**constants,'readerObservation':observation,'readerRoleChecks':dict(roles),
        'negativeHttpChecks':dict(negatives),'proxyMetrics':dict(metrics),
        'rollback':{'sequence':'A_B_A','steps':steps,'faultHealthFailed':True,'automaticRollback':'A','recovered':recovered}}


def project_three_uid_budget(value):
    fields={'databaseMemoryLimitBytes','appMemoryLimitBytes','restMemoryLimitBytes','hostAvailableMemoryBytes','reservedHostMemoryBytes','swapLimitBytes','distinctBoundedCgroupsObserved'}
    if type(value) is not dict or set(value)!=fields or value['distinctBoundedCgroupsObserved'] is not True:return None
    if any(not _count(value[k]) for k in fields-{'distinctBoundedCgroupsObserved'}):return None
    return {k:value[k] for k in fields}

"""Internal fixed same-clone rollback. No external URL, SQL or command entry.

Only the engine invokes this with its scoped owned-clone dependencies after all
T17 gates; separate-UID brokers and immutable assets are observed BEFORE PG is
started. Fixture tests exercise mechanics, never provide runtime authority.
"""
import base64
import datetime
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import socket
import threading
import time
from urllib.parse import urlencode
from .stage_credentials import read_stage_credentials,validate_stage_token,StageCredentialRejected
from .t18_reader_roles import install_fixed_reader_roles
from .fixed_read_proxy import start_fixed_read_proxy,SNAPSHOT_SELECT,STATE_SELECT,_BoundedResponse

MAX_HTTP=2*1024**2
MAX_COUNT=8*1024**3
FINGERPRINT_SQL=b"""SELECT json_build_object(
 'snapshots',(SELECT md5(coalesce(string_agg(md5(row_to_json(t)::text),',' ORDER BY id),'')) FROM public.radar_public_snapshots t),
 'state',(SELECT md5(coalesce(string_agg(md5(row_to_json(t)::text),',' ORDER BY window_key),'')) FROM public.radar_publication_state t),
 'constraints',(SELECT md5(coalesce(string_agg(c.oid::text||':'||c.convalidated::text,',' ORDER BY c.oid),'')) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'))"""
DATES_SQL=b"""SELECT json_build_object('daily',(SELECT json_build_object('contentAsOf',content_as_of,'publishedAt',published_at,'payloadAsOf',payload_json->>'asOf') FROM public.radar_public_snapshots WHERE status='valid' AND window_key='daily' ORDER BY published_at DESC LIMIT 1),'home',(SELECT json_build_object('contentAsOf',content_as_of,'publishedAt',published_at,'payloadAsOf',payload_json->>'asOf') FROM public.radar_public_snapshots WHERE status='valid' AND window_key='home' ORDER BY published_at DESC LIMIT 1))"""


class FixedRollbackRejected(Exception):
    def __init__(self,code='fixed_same_clone_rollback_rejected'):super().__init__(code)


def _http(port,method,target,headers=None):
    # Internal fixed operations only; never exposed as a URL/request API.
    if port not in (3000,3301,3302) or method not in ('GET','POST','PATCH','DELETE'):raise FixedRollbackRejected()
    connection=http.client.HTTPConnection('127.0.0.1',port,timeout=3)
    connection.response_class=_BoundedResponse
    active=[None];expired=threading.Event()
    def stop():
        expired.set();sock=active[0] or connection.sock
        if sock:
            try:sock.shutdown(socket.SHUT_RDWR)
            except OSError:pass
        connection.close()
    timer=threading.Timer(8,stop);timer.start()
    try:
        connection.request(method,target,headers={'Accept-Encoding':'identity','Connection':'close',**(headers or {})})
        active[0]=connection.sock
        response=connection.getresponse()
        if len(response.headers)>32 or response.getheader('Content-Encoding','identity')!='identity':raise FixedRollbackRejected('http_headers_rejected')
        length=response.getheader('Content-Length')
        if length is not None and (not length.isdecimal() or int(length)>MAX_HTTP):raise FixedRollbackRejected('http_size_rejected')
        body=response.read(MAX_HTTP+1)
        if len(body)>MAX_HTTP or expired.is_set():raise FixedRollbackRejected('http_size_or_deadline_rejected')
        return response.status,{k.lower():v for k,v in response.getheaders()},body
    finally:timer.cancel();timer.join(timeout=1);connection.close()


def _timestamp(value):
    if type(value) is not str or not 10<=len(value)<=64:raise FixedRollbackRejected('original_date_missing_or_invalid')
    try:
        parsed=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
        return parsed.replace(tzinfo=datetime.timezone.utc) if parsed.tzinfo is None else parsed.astimezone(datetime.timezone.utc)
    except ValueError:raise FixedRollbackRejected('original_date_missing_or_invalid') from None


def _fingerprint(sql):
    value=json.loads(sql(FINGERPRINT_SQL))
    if (type(value) is not dict or set(value)!={'snapshots','state','constraints'}
        or any(type(v) is not str or not re.fullmatch('[0-9a-f]{32}',v) for v in value.values())):
        raise FixedRollbackRejected('data_fingerprint_rejected')
    return value


def _expected_dates(sql):
    value=json.loads(sql(DATES_SQL))
    if type(value) is not dict or set(value)!={'home','daily'}:raise FixedRollbackRejected('snapshot_dates_rejected')
    for row in value.values():
        if type(row) is not dict or set(row)!={'contentAsOf','publishedAt','payloadAsOf'}:raise FixedRollbackRejected('snapshot_dates_rejected')
        for date in row.values():_timestamp(date)
    return value


def _validate_stale_daily(headers,body,expected):
    try:value=json.loads(body)
    except (ValueError,UnicodeError):raise FixedRollbackRejected('daily_json_rejected') from None
    if type(value) is not dict:raise FixedRollbackRejected('daily_json_rejected')
    health=value.get('projectionHealth')
    if (type(health) is not dict or health.get('status')!='stale_readonly'
        or health.get('freshnessStatus')!='stale_readonly'
        or health.get('actionAuthority')!='disabled' or health.get('acquisitionAuthority')!='disabled'
        or health.get('actionsEnabled') is not False or value.get('snapshotStale') is not True
        or headers.get('x-stockinsider-snapshot-stale')!='true'
        or 'no-store' not in headers.get('cache-control','')):
        raise FixedRollbackRejected('stale_readonly_or_authority_rejected')
    if (value.get('asOf')!=expected['payloadAsOf'] or health.get('contentAsOf')!=expected['payloadAsOf']
        or _timestamp(value.get('snapshotPublishedAt'))!=_timestamp(expected['publishedAt'])
        or _timestamp(headers.get('x-stockinsider-snapshot-published-at'))!=_timestamp(expected['publishedAt'])):
        raise FixedRollbackRejected('original_snapshot_date_changed')
    stages=value.get('stages')
    if stages is not None and (type(stages) is not dict or stages.get('actionable')!=[]):
        raise FixedRollbackRejected('stale_actionable_stage_rejected')
    return {'dailyBytes':len(body),'dailySha256':hashlib.sha256(body).hexdigest(),
        'contentDate':_timestamp(expected['payloadAsOf']).date().isoformat(),
        'snapshotPublishedDate':_timestamp(expected['publishedAt']).date().isoformat(),
        'staleReadonly':True,'actionsEnabled':False}


def _static_asset(release):
    root=Path(release['directory'])/'app' / '.next' / 'static'
    preferred=root/release['buildId']/'_buildManifest.js'
    candidates=[preferred] if preferred.is_file() else sorted(root.rglob('*.js'))
    for path in candidates:
        info=path.stat()
        if 0<info.st_size<=512*1024:
            return '/_next/static/'+path.relative_to(root).as_posix(),hashlib.sha256(path.read_bytes()).hexdigest()
    raise FixedRollbackRejected('fixed_static_asset_missing')


def _health(release,expected,deadline=None):
    deadline=time.monotonic()+60 if deadline is None else deadline
    target,expected_digest=_static_asset(release)
    last=None
    for _ in range(40):
        if time.monotonic()>deadline:raise FixedRollbackRejected('fixed_rollback_deadline')
        try:
            status,headers,body=_http(3000,'GET','/api/radar/daily')
            if status==200:break
            last='http_status'
        except (OSError,http.client.HTTPException):last='connection'
        time.sleep(.1)
    else:raise FixedRollbackRejected('next_daily_health_failed')
    daily=_validate_stale_daily(headers,body,expected)
    home,_,home_body=_http(3000,'GET','/')
    static,_,static_body=_http(3000,'GET',target)
    if home!=200 or static!=200 or hashlib.sha256(static_body).hexdigest()!=expected_digest:
        raise FixedRollbackRejected('next_home_or_static_health_failed')
    return {'sourceCommit':release['sourceCommit'],'buildId':release['buildId'],'nextVersion':'16.3.4',
        'homeStatus':home,'homeBytes':len(home_body),'homeAcceptance':'HTTP_LIVENESS_ONLY',
        'dailyAcceptance':'STALE_READONLY_ORIGINAL_DATE_NO_AUTHORITY','staticStatus':static,'staticSha256':expected_digest,**daily}


def _negative_http(stage_jwt):
    snap='/rest/v1/radar_public_snapshots?'+urlencode({'select':SNAPSHOT_SELECT,'window_key':'eq.daily','status':'eq.valid','order':'published_at.desc','limit':'1'})
    probes=(('POST',snap),('PATCH',snap),('DELETE',snap),('GET','/rest/v1/rpc/publish_radar_public_snapshots'),
        ('POST','/rest/v1/rpc/publish_radar_public_snapshots'),('GET','http://127.0.0.1:3301/radar_public_snapshots'))
    for method,path in probes:
        if _http(3302,method,path)[0] not in (400,403,405):raise FixedRollbackRejected('fixed_get_boundary_failed')
    # Direct raw PostgREST is reachable inside the private namespace. Its
    # authenticating role has no write grants or exposed EXECUTE functions.
    for method,path in (('DELETE','/radar_public_snapshots?window_key=eq.__t18_never__'),
        ('POST','/rpc/publish_radar_public_snapshots')):
        if _http(3301,method,path,{'Authorization':'Bearer '+stage_jwt})[0] not in (400,401,403,404):
            raise FixedRollbackRejected('postgrest_write_or_rpc_not_rejected')
    return {'proxyDenied':len(probes),'postgrestDenied':2}


def _port_closed(port):
    with socket.socket() as sock:
        sock.settimeout(.5);return sock.connect_ex(('127.0.0.1',port))!=0


def _execute_fixed_sequence(app,rest,releases,dates):
    """Private mechanics helper. Tests are not kernel/broker admission."""
    steps=[];deadline=time.monotonic()+180
    try:
        for op,index in (('START_A',0),('START_B',1),('START_A',0)):
            response=app.request(op)
            if response['sourceCommit']!=releases[index]['sourceCommit']:raise FixedRollbackRejected('broker_release_binding_rejected')
            steps.append(_health(releases[index],dates['daily'],deadline))
            app.request('STOP_NEXT')
        app.request('START_B');_health(releases[1],dates['daily'],deadline)
        app.request('FAULT_NEXT')
        try:
            status,_,_=_http(3000,'GET','/api/radar/daily')
            failed=status!=200
        except (OSError,http.client.HTTPException):failed=True
        if not failed:raise FixedRollbackRejected('injected_fault_not_observed')
        # Fixed automatic rollback; no operator assertion substitutes for HTTP.
        app.request('START_A');recovered=_health(releases[0],dates['daily'],deadline)
        return {'sequence':'A_B_A','steps':steps,'faultHealthFailed':True,
            'automaticRollback':'A','recovered':recovered}
    finally:
        app.request('STOP_NEXT')


def run_fixed_same_clone(sql,activate_rest_socket,app,rest,assets):
    """Only invoked by the already-validated engine, never a public CLI API."""
    from .radar_reader_observation import assess_radar_reader
    observation=assess_radar_reader(sql)
    if (observation['status']!='OBSERVED_PUBLISHED_SNAPSHOT' or observation['homeValidSnapshots']<1
        or observation['dailyValidSnapshots']<1 or observation['missingContentDates']):
        return {'status':'GAP_GENUINE_SNAPSHOT_OR_SCHEMA','readerObservation':observation,
            'postgrestAcceptance':'NOT_RUN','nextRollback':'NOT_RUN'}
    before=_fingerprint(sql);dates=_expected_dates(sql)
    roles=install_fixed_reader_roles(sql)
    activate_rest_socket()
    secret,token=read_stage_credentials()
    try:
        for port in (3000,3301,3302):
            if not _port_closed(port):raise FixedRollbackRejected('private_test_port_occupied')
        encoded=base64.b64encode(secret).decode()
        rest.request('CONFIGURE',stageJwt=token,hmacSecretB64=encoded)
        app.request('CONFIGURE',stageJwt=token,hmacSecretB64=encoded)
        with start_fixed_read_proxy(token) as proxy:
            negatives=_negative_http(token)
            sequence=_execute_fixed_sequence(app,rest,assets.releases,dates)
            # A cached Next HTTP200 cannot extend the fixed JWT lifetime.
            validate_stage_token(secret,token,minimum_remaining=0)
            metrics=proxy.metrics
    finally:
        for i in range(len(secret)):secret[i]=0
        cleanup_errors=False
        for broker in (app,rest):
            try:broker.request('SHUTDOWN')
            except Exception:cleanup_errors=True
        if cleanup_errors or any(not _port_closed(port) for port in (3000,3301,3302)):
            raise FixedRollbackRejected('app_or_rest_cleanup_unconfirmed') from None
    after=_fingerprint(sql)
    if before!=after:raise FixedRollbackRejected('snapshot_rows_or_constraint_bits_changed')
    return {'status':'FIXED_OLD_RELEASE_DAILY_ROLLBACK_VERIFIED','readerObservation':observation,
        'readerRoleChecks':roles,'negativeHttpChecks':negatives,'proxyMetrics':metrics,
        'rollback':sequence,'snapshotDataAndConstraintBitsUnchanged':True,
        'postgrestAcceptance':'FIXED_READER_ONLY','nextRollback':'FIXED_OLD_PAIR_VERIFIED',
        'newRadarReleaseAcceptance':'NOT_RUN','stockDetailAcceptance':'NOT_RUN_TWO_TABLE_SCOPE',
        'homeAcceptance':'HTTP_LIVENESS_ONLY','fullBusinessDataAcceptance':False,
        'namespaceKernelCookiesMatched':True,'threeDistinctOsUidsObserved':True,
        'ownedListenersClosed':True,'hostUnitCleanup':'HOST_REQUIRED'}

"""Internal fixed same-clone rollback. No external URL, SQL or command entry.

Only the engine invokes this with its scoped owned-clone dependencies after all
T17 gates; separate-UID brokers and immutable assets are observed BEFORE PG is
started. Fixture tests exercise mechanics, never provide runtime authority.
"""
from contextlib import ExitStack
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
from .t18_release_assets import is_launch_release_pair
from .fixed_read_proxy import start_fixed_read_proxy,SNAPSHOT_SELECT,STATE_SELECT,_BoundedResponse
from .t18_readpoint_diagnostics import http_trace,http_subphase,http_completed

LAUNCH_SCHEMA_SQL=br"""
\set QUIET 1
BEGIN READ ONLY;
SELECT (
 to_regclass('public.vnext_mode_v1') IS NOT NULL AND
 to_regclass('public.vnext_launch_ranking_mode_v1') IS NOT NULL AND
 to_regclass('public.vnext_launch_ranking_snapshots_v1') IS NOT NULL AND
 to_regclass('public.vnext_launch_ranking_members_v1') IS NOT NULL AND
 to_regprocedure('public.vnext_launch_ranking_read_v1(uuid,text)') IS NOT NULL AND
 to_regprocedure('public.vnext_launch_outcome_public_v1(uuid,text)') IS NOT NULL
)::text;
COMMIT;
"""
LAUNCH_HEAD_SQL=br"""
\set QUIET 1
BEGIN READ ONLY;
WITH head AS (
 SELECT ranking_run_id,session_date FROM public.vnext_launch_ranking_snapshots_v1
 ORDER BY ordinal DESC LIMIT 1
), ranked AS (
 SELECT m.rank,m.symbol FROM public.vnext_launch_ranking_members_v1 m JOIN head h USING(ranking_run_id)
 WHERE m.rank IS NOT NULL LIMIT 11
)
SELECT jsonb_build_object(
 'enabled',(EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
            AND EXISTS(SELECT FROM public.vnext_launch_ranking_mode_v1 WHERE enabled)),
 'session',(SELECT to_char(session_date,'YYYY-MM-DD') FROM head),
 'ranked',(SELECT count(*) FROM ranked),
 'valid',(SELECT count(DISTINCT rank)=count(*) AND count(DISTINCT symbol)=count(*)
              AND coalesce(bool_and(rank BETWEEN 1 AND 10 AND symbol~'^[0-9]{4}$'),true)
              AND coalesce(max(rank),0)=count(*) FROM ranked)
);
COMMIT;
"""
LAUNCH_BINDING_SQL=br"""
\set QUIET 1
BEGIN READ ONLY;
WITH head AS (
 SELECT ranking_run_id,session_date,input_cutoff,snapshot FROM public.vnext_launch_ranking_snapshots_v1
 ORDER BY ordinal DESC LIMIT 1
), ranked AS (
 SELECT m.rank,m.symbol,m.research_revision,m.score_revision,m.qualification_revision,m.input_hash
 FROM public.vnext_launch_ranking_members_v1 m JOIN head h USING(ranking_run_id)
 WHERE m.rank IS NOT NULL ORDER BY m.rank LIMIT 11
)
SELECT jsonb_build_object('rankingRunId',ranking_run_id,'session',to_char(session_date,'YYYY-MM-DD'),
 'cutoff',input_cutoff,'headSha256',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),
 'members',(SELECT jsonb_agg(jsonb_build_object('rank',rank,'symbol',symbol,'revisionId',research_revision,
  'scoreRevision',score_revision,'launchQualificationRevision',qualification_revision,'inputHash',input_hash) ORDER BY rank) FROM ranked))
FROM head;
COMMIT;
"""
LAUNCH_API='/api/launch-ranking'
LAUNCH_BINDING_KEYS=frozenset(('rank','symbol','revisionId','scoreRevision','launchQualificationRevision','inputHash'))
LAUNCH_UUID=re.compile(r'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}')
LAUNCH_DIGEST=re.compile(r'[0-9a-f]{64}')
LAUNCH_MIGRATION_MARKERS=frozenset((
    'writerFence',
    'opportunityOwner',
    'marketCalendar',
    'priceHistory',
    'corporateActionHistory',
    'vnextCore',
    'vnextWorker',
    'sourceAuthority',
    'businessAuthority',
    'tradingAuthority',
    'actionTermsAuthority',
    'nativeCsvReady',
    'launchRankingRead',
    'launchOutcomeRead',
    'refreshQueue',
    'privateArtifactReceipts',
    'vnextOwner',
    'catalogCanonicalPinned',
    'backendRequestGuardPinned',
    'artifactRegistrationPinned',
    'writerFenceGuardPinned',
))
# Match the catalog requirements of 20261115_vnext_launch_source_facts_v1.
# An object may exist on the old backup and still fail the exact guard check.
LAUNCH_MIGRATION_PROBE_SQL=br"""
\set QUIET 1
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
WITH expected(marker,signature,body_hash,result_type,returns_set,defaults) AS (VALUES
 ('backendRequestGuardPinned','public.assert_stockinsider_backend_request_v1(boolean)','23f9db45de277921113fc088fb3f9fe2e46474fe7aafbc84163f89351188e453','uuid',false,1),
 ('artifactRegistrationPinned','public.register_private_artifact_receipt_v1(text,bigint,text,text,jsonb)','0e4c72c288d5041b770f78315018b0a724b1814a51c75eb10c06b4606644798f','record',true,1),
 ('writerFenceGuardPinned','public.enforce_production_writer_fence()','8230515bef78902c9f955f5c87a77f8b04ef02fa22525a5c4828849f56a9273a','trigger',false,0)
), guards AS (
 SELECT e.marker,EXISTS(
  SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
  WHERE p.oid=to_regprocedure(e.signature)
   AND p.proowner=(SELECT relowner FROM pg_class WHERE oid=to_regclass('public.private_artifact_receipts_v1'))
   AND p.prosecdef AND p.prokind='f' AND l.lanname='plpgsql' AND p.proretset=e.returns_set
   AND p.prorettype=to_regtype(e.result_type) AND p.pronargdefaults=e.defaults AND p.provariadic=0
   AND p.provolatile='v' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof
   AND p.proconfig=ARRAY['search_path=public, pg_temp']
   AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=e.body_hash
 ) AS matches FROM expected e
)
SELECT jsonb_build_object(
 'writerFence',(to_regprocedure('public.enforce_production_writer_fence()') IS NOT NULL),
 'opportunityOwner',(EXISTS(SELECT FROM pg_roles WHERE rolname='opportunity_v3_rpc_owner' AND NOT (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication) AND rolconfig IS NULL)),
 'marketCalendar',(to_regclass('public.tw_trading_sessions_v3') IS NOT NULL),
 'priceHistory',(to_regclass('public.opportunity_price_observations_v3') IS NOT NULL),
 'corporateActionHistory',(to_regclass('public.opportunity_corporate_action_snapshots_v3') IS NOT NULL),
 'vnextCore',(to_regclass('public.vnext_mode_v1') IS NOT NULL AND to_regclass('public.vnext_publications_v1') IS NOT NULL),
 'vnextWorker',(to_regclass('public.vnext_provider_invocations_v1') IS NOT NULL),
 'sourceAuthority',(to_regprocedure('public.vnext_input_sources_current_v1(jsonb,text)') IS NOT NULL),
 'businessAuthority',(to_regprocedure('public.vnext_business_criteria_current_v1(uuid,text)') IS NOT NULL),
 'tradingAuthority',(to_regprocedure('public.vnext_trading_invalid_current_v1(text,text)') IS NOT NULL),
 'actionTermsAuthority',(to_regprocedure('public.vnext_action_terms_current_internal_v1(uuid,text,timestamptz)') IS NOT NULL),
 'nativeCsvReady',(to_regclass('public.vnext_launch_csv_ready_acks_v1') IS NOT NULL AND to_regprocedure('public.vnext_launch_csv_backend_v1(uuid,text,integer)') IS NOT NULL),
 'launchRankingRead',(to_regprocedure('public.vnext_launch_ranking_read_v1(uuid,text)') IS NOT NULL),
 'launchOutcomeRead',(to_regprocedure('public.vnext_launch_outcome_public_v1(uuid,text)') IS NOT NULL),
 'refreshQueue',(to_regclass('public.taiwan_data_refresh_queue_v5') IS NOT NULL),
 'privateArtifactReceipts',(to_regclass('public.private_artifact_receipts_v1') IS NOT NULL),
 'vnextOwner',(EXISTS(SELECT FROM pg_roles r WHERE rolname='stockinsider_vnext_owner'
  AND NOT (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
  AND rolconfig IS NULL
  AND NOT EXISTS(SELECT FROM pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)
  AND NOT EXISTS(SELECT FROM pg_db_role_setting d WHERE d.setrole=r.oid AND d.setconfig IS NOT NULL))),
 'catalogCanonicalPinned',(EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('public.vnext_catalog_canonical_v1(jsonb)')
  AND pg_get_userbyid(p.proowner)='stockinsider_vnext_owner' AND NOT p.prosecdef
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='597081dda160ac0e369b5f5306bee102caac5b78b19cd82583e0e9408cc4f464'))
) || (SELECT jsonb_object_agg(marker,matches) FROM guards);
COMMIT;
"""
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
    primary_error=None
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
    except BaseException as error:primary_error=error;raise
    finally:
        cleanup_error=None
        for action in (timer.cancel,lambda:timer.join(timeout=1),connection.close):
            try:action()
            except Exception as error:
                if cleanup_error is None:cleanup_error=error
        if primary_error is None and cleanup_error is not None:raise cleanup_error


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


def _health(release,expected,deadline=None,step='aba_first_a'):
    deadline=time.monotonic()+60 if deadline is None else deadline
    with http_subphase(step+'_static_select'):target,expected_digest=_static_asset(release)
    last=None
    with http_subphase(step+'_daily'):
        for _ in range(40):
            if time.monotonic()>deadline:raise FixedRollbackRejected('fixed_rollback_deadline')
            try:
                status,headers,body=_http(3000,'GET','/api/radar/daily')
                if status==200:break
                last='http_status'
            except (OSError,http.client.HTTPException) as error:last='timeout' if isinstance(error,TimeoutError) else 'connection'
            time.sleep(.1)
        else:
            if last=='timeout':raise TimeoutError()
            raise FixedRollbackRejected('next_daily_health_failed')
        daily=_validate_stale_daily(headers,body,expected)
    with http_subphase(step+'_home'):
        home,_,home_body=_http(3000,'GET','/')
    with http_subphase(step+'_static'):
        static,_,static_body=_http(3000,'GET',target)
    with http_subphase(step+'_home'):
        if home!=200:raise FixedRollbackRejected('next_home_or_static_health_failed')
    with http_subphase(step+'_static'):
        if static!=200 or hashlib.sha256(static_body).hexdigest()!=expected_digest:raise FixedRollbackRejected('next_home_or_static_health_failed')
    return {'sourceCommit':release['sourceCommit'],'buildId':release['buildId'],'nextVersion':'16.3.4',
        'homeStatus':home,'homeBytes':len(home_body),'homeAcceptance':'HTTP_LIVENESS_ONLY',
        'dailyAcceptance':'STALE_READONLY_ORIGINAL_DATE_NO_AUTHORITY','staticStatus':static,'staticSha256':expected_digest,**daily}


def _launch_digest(value):
    try:wire=json.dumps(value,sort_keys=True,ensure_ascii=True,separators=(',',':'),allow_nan=False)
    except (TypeError,ValueError):raise FixedRollbackRejected('launch_frozen_projection_invalid') from None
    return hashlib.sha256(wire.encode('ascii')).hexdigest()


def _expected_launch_binding(sql,observation):
    raw=sql(LAUNCH_BINDING_SQL)
    if not isinstance(raw,(str,bytes)) or len(raw)>8192:
        raise FixedRollbackRejected('launch_clone_binding_rejected')
    try:value=json.loads(raw)
    except (ValueError,UnicodeError):raise FixedRollbackRejected('launch_clone_binding_rejected') from None
    if (type(value) is not dict or set(value)!={'rankingRunId','session','cutoff','headSha256','members'}
        or value['session']!=observation['session'] or type(value['rankingRunId']) is not str
        or LAUNCH_UUID.fullmatch(value['rankingRunId']) is None
        or type(value['headSha256']) is not str or LAUNCH_DIGEST.fullmatch(value['headSha256']) is None
        or type(value['members']) is not list or len(value['members'])!=observation['ranked']):
        raise FixedRollbackRejected('launch_clone_binding_rejected')
    cutoff=_timestamp(value['cutoff'])
    if cutoff!=_timestamp(value['session']+'T21:30:00+08:00'):
        raise FixedRollbackRejected('launch_clone_cutoff_rejected')
    for rank,member in enumerate(value['members'],1):
        if (type(member) is not dict or set(member)!=LAUNCH_BINDING_KEYS
            or type(member['rank']) is not int or member['rank']!=rank or type(member['symbol']) is not str
            or re.fullmatch(r'[0-9]{4}',member['symbol']) is None
            or any(type(member[field]) is not str or LAUNCH_UUID.fullmatch(member[field]) is None
                for field in ('revisionId','scoreRevision','launchQualificationRevision'))
            or type(member['inputHash']) is not str or LAUNCH_DIGEST.fullmatch(member['inputHash']) is None):
            raise FixedRollbackRejected('launch_clone_member_binding_rejected')
    return value


def _launch_result(response,expected):
    status,headers,body=response
    if status!=200 or 'no-store' not in headers.get('cache-control',''):
        raise FixedRollbackRejected('launch_http_not_ready')
    try:value=json.loads(body)
    except (ValueError,UnicodeError):raise FixedRollbackRejected('launch_http_invalid') from None
    if (type(value) is not dict or value.get('ok') is not True or type(value.get('result')) is not dict
        or value['result'].get('availability')!='ready'):
        raise FixedRollbackRejected('launch_http_invalid')
    result=value['result'];snapshot=result.get('snapshot')
    if (type(snapshot) is not dict or snapshot.get('rankingRunId')!=expected['rankingRunId']
        or snapshot.get('session')!=expected['session'] or _timestamp(snapshot.get('cutoff'))!=_timestamp(expected['cutoff'])
        or type(snapshot.get('members')) is not list or len(snapshot['members'])!=len(expected['members'])):
        raise FixedRollbackRejected('launch_http_frozen_head_mismatch')
    for member,pin in zip(snapshot['members'],expected['members']):
        if type(member) is not dict or any(member.get(key)!=v for key,v in pin.items()):
            raise FixedRollbackRejected('launch_http_member_pin_mismatch')
    return result


def _launch_health(release,expected,deadline,step):
    with http_subphase(step+'_static_select'):target,asset_hash=_static_asset(release)
    with http_subphase(step+'_daily'):
        last=None
        for _ in range(40):
            if time.monotonic()>deadline:break
            try:
                last=_http(3000,'GET',LAUNCH_API)
                if last[0]==200:break
            except (OSError,http.client.HTTPException):pass
            time.sleep(.1)
        if last is None:raise FixedRollbackRejected('launch_http_start_failed')
        current=_launch_result(last,expected)
        first=expected['members'][0]
        query=urlencode({'rankingRunId':expected['rankingRunId'],'symbol':first['symbol']})
        selected=_launch_result(_http(3000,'GET',LAUNCH_API+'?'+query),expected)
        detail=selected.get('detail')
        if (type(detail) is not dict or detail.get('rankingRunId')!=expected['rankingRunId']
            or any(detail.get(key)!=value for key,value in first.items() if key!='rank')):
            raise FixedRollbackRejected('launch_http_detail_pin_mismatch')
        snapshot_hash=_launch_digest(current['snapshot'])
        if snapshot_hash!=_launch_digest(selected['snapshot']):
            raise FixedRollbackRejected('launch_http_head_and_detail_disagree')
        detail_hash=_launch_digest(detail)
    with http_subphase(step+'_home'):
        home_status,_,home=_http(3000,'GET','/')
        query=urlencode({'launchRunId':expected['rankingRunId'],'launchResearchRevision':first['revisionId'],
                        'launchScoreRevision':first['scoreRevision']})
        detail_status,_,detail_page=_http(3000,'GET','/stock/'+first['symbol']+'?'+query)
        if (home_status!=200 or detail_status!=200 or expected['rankingRunId'].encode('ascii') not in home
            or b'data-testid="launch-ranking-binding"' not in detail_page):
            raise FixedRollbackRejected('launch_html_binding_missing')
    with http_subphase(step+'_static'):
        static,_,body=_http(3000,'GET',target)
        if static!=200 or hashlib.sha256(body).hexdigest()!=asset_hash:
            raise FixedRollbackRejected('next_home_or_static_health_failed')
    return {'sourceCommit':release['sourceCommit'],'buildId':release['buildId'],'nextVersion':'16.3.4',
        'homeStatus':home_status,'detailStatus':detail_status,'staticStatus':static,'staticSha256':asset_hash,
        'snapshotSha256':snapshot_hash,'detailSha256':detail_hash,'session':expected['session'],
        'ranked':len(expected['members'])}


def _negative_http(stage_jwt):
    snap='/rest/v1/radar_public_snapshots?'+urlencode({'select':SNAPSHOT_SELECT,'window_key':'eq.daily','status':'eq.valid','order':'published_at.desc','limit':'1'})
    probes=(('POST',snap),('PATCH',snap),('DELETE',snap),('GET','/rest/v1/rpc/publish_radar_public_snapshots'),
        ('POST','/rest/v1/rpc/publish_radar_public_snapshots'),('GET','http://127.0.0.1:3301/radar_public_snapshots'))
    with http_subphase('proxy_denial_probes'):
        for method,path in probes:
            if _http(3302,method,path)[0] not in (400,403,405):raise FixedRollbackRejected('fixed_get_boundary_failed')
    http_completed('proxyDenialsPassed')
    # Direct raw PostgREST is reachable inside the private namespace. Its
    # authenticating role has no write grants or exposed EXECUTE functions.
    with http_subphase('rest_denial_probes'):
        for index,(method,path) in enumerate((('DELETE','/radar_public_snapshots?window_key=eq.__t18_never__'),
            ('POST','/rpc/publish_radar_public_snapshots'))):
            if index==0:
                with http_subphase('rest_target_readiness'):response=_http(3301,method,path,{'Authorization':'Bearer '+stage_jwt})
                http_completed('restTargetResponded')
            else:response=_http(3301,method,path,{'Authorization':'Bearer '+stage_jwt})
            if response[0] not in (400,401,403,404):raise FixedRollbackRejected('postgrest_write_or_rpc_not_rejected')
    http_completed('restDenialsPassed')
    return {'proxyDenied':len(probes),'postgrestDenied':2}


def _port_closed(port):
    with socket.socket() as sock:
        sock.settimeout(.5);return sock.connect_ex(('127.0.0.1',port))!=0


def _execute_fixed_sequence(app,rest,releases,dates,*,launch=False):
    """Private mechanics helper. Tests are not kernel/broker admission."""
    health=_launch_health if launch else _health
    expected=dates if launch else dates['daily']
    target=LAUNCH_API if launch else '/api/radar/daily'
    steps=[];deadline=time.monotonic()+180
    primary_error=None
    try:
        for op,index,step,flag in (('START_A',0,'aba_first_a','firstAHealthPassed'),('START_B',1,'aba_b','bHealthPassed'),('START_A',0,'aba_return_a','returnAHealthPassed')):
            with http_subphase(step+'_start'):
                response=app.request(op)
                if response['sourceCommit']!=releases[index]['sourceCommit']:raise FixedRollbackRejected('broker_release_binding_rejected')
            steps.append(health(releases[index],expected,deadline,step))
            http_completed(flag)
            with http_subphase(step+'_stop'):app.request('STOP_NEXT')
        with http_subphase('fault_b_start'):app.request('START_B')
        health(releases[1],expected,deadline,'fault_b');http_completed('faultBReady')
        with http_subphase('fault_inject'):app.request('FAULT_NEXT')
        with http_subphase('fault_observe'):
            try:
                status,_,_=_http(3000,'GET',target)
                failed=status!=200
            except (OSError,http.client.HTTPException):failed=True
            if not failed:raise FixedRollbackRejected('injected_fault_not_observed')
        http_completed('faultObserved')
        # Fixed automatic rollback; no operator assertion substitutes for HTTP.
        with http_subphase('rollback_a_start'):app.request('START_A')
        recovered=health(releases[0],expected,deadline,'rollback_a');http_completed('rollbackAHealthPassed')
        return {'sequence':'A_B_A','steps':steps,'faultHealthFailed':True,
            'automaticRollback':'A','recovered':recovered}
    except BaseException as error:primary_error=error;raise
    finally:
        try:
            with http_subphase('sequence_final_stop'):app.request('STOP_NEXT')
        except Exception:
            if primary_error is None:raise


def project_launch_migration_markers(value):
    if type(value) is not dict or set(value)!=LAUNCH_MIGRATION_MARKERS:
        return None
    if any(type(item) is not bool for item in value.values()):return None
    return dict(value)


def _observe_launch_migration_markers(sql):
    raw=sql(LAUNCH_MIGRATION_PROBE_SQL)
    if not isinstance(raw,(str,bytes)) or len(raw)>2048:
        raise FixedRollbackRejected('launch_clone_migration_markers_rejected')
    try:decoded=json.loads(raw)
    except (ValueError,UnicodeError):raise FixedRollbackRejected('launch_clone_migration_markers_rejected') from None
    value=project_launch_migration_markers(decoded)
    if value is None:raise FixedRollbackRejected('launch_clone_migration_markers_rejected')
    return value


def _observe_launch_readpoint(sql):
    """Observe only the current cloned ranking head. Do not grant or run the app."""
    schema=sql(LAUNCH_SCHEMA_SQL)
    if isinstance(schema,bytes):schema=schema.decode('ascii')
    if type(schema) is not str or schema.strip() not in ('true','false'):
        raise FixedRollbackRejected('launch_clone_schema_probe_rejected')
    if schema.strip()=='false':
        return {'status':'SCHEMA_MISSING','session':None,'ranked':None}
    raw=sql(LAUNCH_HEAD_SQL)
    if not isinstance(raw,(str,bytes)) or len(raw)>1024:
        raise FixedRollbackRejected('launch_clone_head_probe_rejected')
    try:value=json.loads(raw)
    except (ValueError,UnicodeError):raise FixedRollbackRejected('launch_clone_head_probe_rejected') from None
    if (type(value) is not dict or set(value)!={'enabled','session','ranked','valid'}
        or type(value['enabled']) is not bool or type(value['ranked']) is not int
        or type(value['valid']) is not bool or not 0<=value['ranked']<=11):
        raise FixedRollbackRejected('launch_clone_head_probe_rejected')
    date=value['session']
    if date is not None:
        if type(date) is not str or len(date)!=10:
            raise FixedRollbackRejected('launch_clone_session_rejected')
        try:canonical=datetime.date.fromisoformat(date).isoformat()
        except ValueError:raise FixedRollbackRejected('launch_clone_session_rejected') from None
        if canonical!=date:raise FixedRollbackRejected('launch_clone_session_rejected')
    if not value['enabled']:
        return {'status':'PRODUCER_DISABLED','session':None,'ranked':None}
    if date is None:
        if value['ranked']!=0:raise FixedRollbackRejected('launch_clone_head_probe_rejected')
        return {'status':'NOT_PUBLISHED','session':None,'ranked':0}
    if not value['valid'] or value['ranked']>10:
        return {'status':'RANK_BINDING_INVALID','session':date,'ranked':None}
    return {'status':'FROZEN_RANK_ROWS_OBSERVED' if value['ranked'] else 'TOP_ZERO',
        'session':date,'ranked':value['ranked']}


def run_fixed_same_clone(sql,activate_rest_socket,app,rest,assets):
    """Only invoked by the already-validated engine, never a public CLI API."""
    from .radar_reader_observation import assess_radar_reader
    from .late_stage_credentials import request_fresh_stage
    from .t18_broker_transport import connect_fixed_app_broker
    from .t18_runtime_observation import observe_three_uid_budget
    from .t18_readpoint_diagnostics import readpoint_phase
    launch=is_launch_release_pair(assets.releases)
    if launch:
        with readpoint_phase('radar_readpoint'):observation=_observe_launch_readpoint(sql)
        if observation['status']!='FROZEN_RANK_ROWS_OBSERVED':
            gap={'status':'LAUNCH_CLONE_READPOINT_ONLY','launchReadpoint':observation,
                 'postgrestAcceptance':'NOT_RUN','nextRollback':'NOT_RUN',
                 'candidateDetailHttp':{'status':'GAP_DETAIL_SCOPE'}}
            if observation['status']=='SCHEMA_MISSING':
                with readpoint_phase('radar_readpoint'):
                    gap['migrationPrerequisites']=_observe_launch_migration_markers(sql)
            return gap
        with readpoint_phase('snapshot_dates'):dates=_expected_launch_binding(sql,observation)
    else:
        with readpoint_phase('radar_readpoint'):observation=assess_radar_reader(sql)
        if (observation['status']!='OBSERVED_PUBLISHED_SNAPSHOT' or observation['homeValidSnapshots']<1
            or observation['dailyValidSnapshots']<1 or observation['missingContentDates']):
            return {'status':'GAP_GENUINE_SNAPSHOT_OR_SCHEMA','readerObservation':observation,
                'postgrestAcceptance':'NOT_RUN','nextRollback':'NOT_RUN','candidateDetailHttp':{'status':'GAP_DETAIL_SCOPE'}}
        with readpoint_phase('snapshot_dates'):dates=_expected_dates(sql)
    with readpoint_phase('snapshot_fingerprint'):before=_fingerprint(sql)
    with readpoint_phase('reader_role_install'):roles=install_fixed_reader_roles(sql,allow_launch_reads=launch)
    detail_read,detail_http=None,{'status':'GAP_DETAIL_SCOPE'}
    if not launch:
        with readpoint_phase('candidate_detail_prepare'):
            from .t18_detail_read_adapter import prepare_detail_read
            detail_read,detail_http=prepare_detail_read(sql)
    with readpoint_phase('owned_socket_activation'):activate_rest_socket()
    # The original pre-key APP was kernel/asset-verified with public placeholder
    # only. Root must stop/recreate it; no credential file is rewritten in-place.
    with readpoint_phase('initial_app_shutdown'):app.request('SHUTDOWN')
    with readpoint_phase('stage_credential_handoff'):secret,token=request_fresh_stage()
    try:
        with http_trace():
            if not launch:
                http_completed('detailPreparationCompleted')
                http_completed('detailReadPrepared' if detail_read is not None else 'detailPreparationGap')
                if (detail_read is None and detail_http.get('status')=='GAP_DETAIL_PUBLIC_JSON'
                    and detail_http.get('profileDiagnostic',{}).get('category')=='BOUNDS'
                    and detail_http['profileDiagnostic'].get('reason')=='BOUND_EXCEEDED'):http_completed('detailBoundsGap')
            stack=ExitStack();primary_error=None
            try:
                with readpoint_phase('fresh_app_binding'):
                    fresh_app=stack.enter_context(connect_fixed_app_broker())
                    observe_three_uid_budget(fresh_app,rest)
                try:
                    with readpoint_phase('port_preconditions'):
                        for port in (3000,3301,3302):
                            if not _port_closed(port):raise FixedRollbackRejected('private_test_port_occupied')
                    encoded=base64.b64encode(secret).decode()
                    with readpoint_phase('rest_configure'):rest.request('CONFIGURE',stageJwt=token,hmacSecretB64=encoded)
                    with readpoint_phase('app_configure'):fresh_app.request('CONFIGURE',stageJwt=token,hmacSecretB64=encoded)
                    with readpoint_phase('fixed_http_exercise'):
                        with start_fixed_read_proxy(token,detail_read=detail_read,allow_launch_reads=launch) as proxy:
                            negatives=_negative_http(token)
                            sequence=_execute_fixed_sequence(fresh_app,rest,assets.releases,dates,launch=launch)
                            if detail_read is not None:
                                from .t18_detail_http import exercise_detail_http
                                detail_http=exercise_detail_http(fresh_app,assets.releases,detail_read)
                                http_completed('detailHttpPassed')
                            with readpoint_phase('final_token_check'):validate_stage_token(secret,token,minimum_remaining=0)
                            metrics=proxy.metrics
                except BaseException as error:
                    primary_error=error;raise
                finally:
                    cleanup_error=None
                    for broker,label,flag in ((fresh_app,'app_broker_shutdown','appShutdownAcknowledged'),(rest,'rest_broker_shutdown','restShutdownAcknowledged')):
                        try:
                            with http_subphase(label):broker.request('SHUTDOWN')
                            http_completed(flag)
                        except Exception as error:
                            if cleanup_error is None:cleanup_error=error
                    try:
                        with http_subphase('broker_ports_closed'):
                            closed=[];port_error=None
                            for port in (3000,3301,3302):
                                try:closed.append(_port_closed(port))
                                except Exception as error:
                                    closed.append(False)
                                    if port_error is None:port_error=error
                            if port_error is not None:raise port_error
                            if not all(closed):raise FixedRollbackRejected('app_or_rest_cleanup_unconfirmed')
                    except Exception as error:
                        if cleanup_error is None:cleanup_error=error
                    if primary_error is None and cleanup_error is not None:raise cleanup_error
            except BaseException as error:
                primary_error=error;raise
            finally:
                try:
                    with http_subphase('app_transport_close'):stack.close()
                    http_completed('appTransportClosed')
                except Exception:
                    if primary_error is None:raise
    finally:secret[:]=bytes(len(secret))
    with readpoint_phase('snapshot_final_check'):
        after=_fingerprint(sql)
        if before!=after:raise FixedRollbackRejected('snapshot_rows_or_constraint_bits_changed')
        if launch and _expected_launch_binding(sql,observation)!=dates:
            raise FixedRollbackRejected('launch_frozen_clone_binding_changed')
    if launch:
        return {'candidateDetailHttp':detail_http,'status':'FIXED_LAUNCH_RELEASE_ROLLBACK_VERIFIED',
            'launchReadpoint':observation,'readerRoleChecks':roles,'negativeHttpChecks':negatives,
            'proxyMetrics':metrics,'rollback':sequence,'snapshotDataAndConstraintBitsUnchanged':True,
            'postgrestAcceptance':'FIXED_LAUNCH_READER_ONLY','nextRollback':'FIXED_LAUNCH_PAIR_VERIFIED',
            'namespaceKernelCookiesMatched':True,'threeDistinctOsUidsObserved':True,
            'ownedListenersClosed':True,'hostUnitCleanup':'HOST_REQUIRED'}
    return {'candidateDetailHttp':detail_http,'status':'FIXED_OLD_RELEASE_DAILY_ROLLBACK_VERIFIED','readerObservation':observation,
        'readerRoleChecks':roles,'negativeHttpChecks':negatives,'proxyMetrics':metrics,
        'rollback':sequence,'snapshotDataAndConstraintBitsUnchanged':True,
        'postgrestAcceptance':'FIXED_READER_ONLY','nextRollback':'FIXED_OLD_PAIR_VERIFIED',
        'newRadarReleaseAcceptance':'NOT_RUN','stockDetailAcceptance':'NOT_RUN_TWO_TABLE_SCOPE',
        'homeAcceptance':'HTTP_LIVENESS_ONLY','fullBusinessDataAcceptance':False,
        'namespaceKernelCookiesMatched':True,'threeDistinctOsUidsObserved':True,
        'ownedListenersClosed':True,'hostUnitCleanup':'HOST_REQUIRED'}

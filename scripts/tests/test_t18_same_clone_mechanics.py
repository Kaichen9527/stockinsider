"""PUBLIC HTTP/process MECHANICS ONLY: neither Next nor PostgREST binaries.

Generated Python release fixtures exercise the real controller HTTP health,
fixed A/B/A sequence and killed-child rollback. They grant no runtime admission,
do not implement a DB/REST provider, and are NOT #403 release acceptance.
"""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import resource
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time
import unittest

from deployment.staging.vnext.t17_keyfd import t18_same_clone as m
from deployment.staging.vnext.t17_keyfd import t18_app_broker as jwt
from deployment.staging.vnext.t17_keyfd.t18_release_assets import RELEASE_PINS,LAUNCH_RELEASE_PINS
from deployment.staging.vnext.t17_keyfd.t18_receipt import project_exercise

AS_OF='2026-09-19T04:00:00Z'
PUBLISHED='2026-09-19T05:00:00Z'
EXPECTED={'contentAsOf':AS_OF,'publishedAt':PUBLISHED,'payloadAsOf':AS_OF}

# Two standalone generated programs have distinct embedded build IDs, payloads
# and static bytes. No public runtime command/executable/path selector is added.
PROGRAM=r'''
import http.server,json
BUILD_ID=__BUILD_ID__
STATIC=__STATIC__
MODE=__MODE__
BODY={'asOf':'2026-09-19T04:00:00Z','snapshotPublishedAt':'2026-09-19T05:00:00Z',
 'snapshotStale':True,'stages':{'actionable':[]},
 'projectionHealth':{'status':'stale_readonly','freshnessStatus':'stale_readonly',
  'actionAuthority':'disabled','acquisitionAuthority':'disabled','actionsEnabled':False,
  'contentAsOf':'2026-09-19T04:00:00Z'}}
if MODE=='stale':BODY['snapshotStale']=False
if MODE=='authority':BODY['projectionHealth']['actionAuthority']='enabled'
if MODE=='actions':BODY['projectionHealth']['actionsEnabled']=True
if MODE=='date':BODY['asOf']='2026-11-15T04:00:00Z'
if MODE=='actionable':BODY['stages']['actionable']=[{'PUBLIC_FIXTURE_ONLY':True}]
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/api/radar/daily':
   data=json.dumps(BODY,separators=(',',':')).encode();kind='application/json'
  elif self.path=='/':data=('<html>PUBLIC PYTHON FIXTURE '+BUILD_ID+'</html>').encode();kind='text/html'
  elif self.path=='/_next/static/'+BUILD_ID+'/_buildManifest.js':
   data=b'PUBLIC_WRONG_STATIC' if MODE=='static' else STATIC;kind='application/javascript'
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',kind)
  self.send_header('Content-Length',str(len(data)))
  self.send_header('Cache-Control','public' if MODE=='cache' else 'no-store')
  self.send_header('X-Stockinsider-Snapshot-Stale','true')
  self.send_header('X-Stockinsider-Snapshot-Published-At','2026-09-19T05:00:00Z')
  self.end_headers();self.wfile.write(data)
class Server(http.server.HTTPServer):allow_reuse_address=True
Server(('127.0.0.1',3000),Handler).serve_forever(poll_interval=.02)
'''


def child_limits():
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    resource.setrlimit(resource.RLIMIT_CPU,(10,10))
    resource.setrlimit(resource.RLIMIT_FSIZE,(1024**2,1024**2))
    resource.setrlimit(resource.RLIMIT_NOFILE,(32,32))
    os.setsid()


class PublicFixtureBroker:
    """Test-only fixed children, not a peer/broker/runtime admission proof."""
    def __init__(self,root,mode='normal'):
        self.root=Path(root);self.child=None;self.children=[];self.ops=[]
        self.release=None;self.programs=[];self.releases=[]
        for index,(commit,_) in enumerate(RELEASE_PINS):
            build='fixtureA' if index==0 else 'fixtureB'
            directory=self.root/build;static=directory/'app'/'.next'/'static'/build
            static.mkdir(parents=True)
            data=('self.PUBLIC_PYTHON_MECHANISM_'+build+'=true;\n').encode()
            (static/'_buildManifest.js').write_bytes(data)
            program=directory/'public_python_http_fixture.py'
            program.write_text(PROGRAM.replace('__BUILD_ID__',repr(build)).replace('__STATIC__',repr(data)).replace('__MODE__',repr(mode)))
            self.programs.append(program)
            self.releases.append({'sourceCommit':commit,'buildId':build,'directory':str(directory)})
    def _stop(self,kill=False):
        if self.child is not None:
            if self.child.poll() is None:
                try:os.killpg(self.child.pid,signal.SIGKILL if kill else signal.SIGTERM)
                except ProcessLookupError:pass
            try:self.child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(self.child.pid,signal.SIGKILL);self.child.wait(timeout=2)
            self.child=None
    def request(self,op):
        self.ops.append(op)
        if op in ('START_A','START_B'):
            self._stop();index=0 if op=='START_A' else 1;self.release=self.releases[index]
            self.child=subprocess.Popen([sys.executable,'-I','-B',str(self.programs[index])],
                env={'PATH':'/usr/bin:/bin','LC_ALL':'C','HOME':str(self.root)},cwd=self.root,
                stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                close_fds=True,preexec_fn=child_limits)
            self.children.append(self.child)
            for _ in range(100):
                if self.child.poll() is not None:raise RuntimeError('public_fixture_child_failed')
                with socket.socket() as connection:
                    if connection.connect_ex(('127.0.0.1',3000))==0:break
                time.sleep(.01)
            else:raise RuntimeError('public_fixture_child_timeout')
        elif op in ('STOP_NEXT','FAULT_NEXT','SHUTDOWN'):self._stop(op=='FAULT_NEXT')
        else:raise ValueError('test_fixed_operation_rejected')
        return {'sourceCommit':None if self.release is None else self.release['sourceCommit']}
    def close(self):self.request('SHUTDOWN')


class SameCloneMechanicsOnlyTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(m._port_closed(3000),'public_fixture_port_already_occupied')
        self.directory=tempfile.TemporaryDirectory(prefix='t18-public-mechanics-',dir='/tmp')
        self.addCleanup(self.directory.cleanup)
    def broker(self,mode='normal'):
        broker=PublicFixtureBroker(self.directory.name,mode)
        self.addCleanup(broker.close)
        return broker
    def assert_clean(self,broker):
        self.assertTrue(all(child.poll() is not None for child in broker.children))
        self.assertTrue(m._port_closed(3000))
    def test_launch_pair_reports_clone_data_without_starting_http_or_granting_reader(self):
        class Assets:
            releases=[{'sourceCommit':sha,'manifestSha256':pin} for sha,pin in LAUNCH_RELEASE_PINS]
        def unexpected(*_):
            self.fail('launch_readpoint_triggered_runtime')
        detail_projections=dict.fromkeys(m.LAUNCH_DETAIL_PROJECTION_KEYS,'MISSING')
        for schema,head,wanted in (
            ('false',None,{'status':'SCHEMA_MISSING','session':None,'ranked':None}),
            ('true',{'enabled':True,'session':None,'ranked':0,'valid':True},
             {'status':'NOT_PUBLISHED','session':None,'ranked':0}),
            ('true',{'enabled':True,'session':'2026-11-13','ranked':0,'valid':True},
             {'status':'TOP_ZERO','session':'2026-11-13','ranked':0}),
            ('true',{'enabled':True,'session':'2026-11-13','ranked':1,'valid':False},
             {'status':'RANK_BINDING_INVALID','session':'2026-11-13','ranked':None}),
        ):
            calls=[]
            def query(statement):
                calls.append(statement)
                if statement==m.LAUNCH_SCHEMA_SQL:return schema
                if statement==m.LAUNCH_DETAIL_PROJECTION_SQL:return json.dumps(detail_projections)
                if statement==m.LAUNCH_HEAD_SQL and head is not None:return json.dumps(head)
                if statement==m.LAUNCH_MIGRATION_PROBE_SQL and schema=='false':
                    return json.dumps({name:False for name in m.LAUNCH_MIGRATION_MARKERS})
                self.fail('unexpected_sql')
            raw=m.run_fixed_same_clone(query,unexpected,object(),object(),Assets())
            self.assertEqual(raw.pop('candidateDetailHttp'),{'status':'GAP_DETAIL_SCOPE'})
            projected=project_exercise(raw)
            self.assertEqual(projected['launchReadpoint'],wanted)
            self.assertEqual(projected['nextRollback'],'NOT_RUN')
            self.assertEqual(projected['launchDetailProjections'],detail_projections)
            self.assertEqual(len(calls),3)
            self.assertIsNone(project_exercise({**raw,'launchDetailProjections':{**detail_projections,'extra':'MISSING'}}))
            self.assertIsNone(project_exercise({**raw,'launchDetailProjections':{**detail_projections,'reportedEps':[]}}))
            if schema=='false':
                self.assertEqual(projected['migrationPrerequisites'],{name:False for name in m.LAUNCH_MIGRATION_MARKERS})
                stale=projected['migrationPrerequisites'].copy();stale['writerFence']=1
                self.assertIsNone(project_exercise({**raw,'migrationPrerequisites':stale}))
            raw['launchReadpoint']['unreviewed']='PUBLIC_TEST_REJECTED'
            self.assertIsNone(project_exercise(raw))

    def test_launch_detail_projection_probe_rejects_invalid_catalog_response(self):
        pinned=dict.fromkeys(m.LAUNCH_DETAIL_PROJECTION_KEYS,'PINNED')
        self.assertEqual(m._observe_launch_detail_projections(lambda _:json.dumps(pinned)),pinned)
        for value in (None,b'null',b'not-json',b'X'*1025,json.dumps({'reportedEps':'PINNED'})):
            with self.subTest(value=type(value)),self.assertRaisesRegex(m.FixedRollbackRejected,'detail_projection_probe_rejected'):
                m._observe_launch_detail_projections(lambda _:value)

    def test_core_rehearsal_projects_only_disabled_install_and_exact_predecessors(self):
        from deployment.staging.vnext.t17_keyfd import t18_core_migration_rehearsal as core
        root=Path(__file__).resolve().parents[2]
        migration=(root/'migrations'/core._LEGACY_NAME).read_bytes()
        self.assertEqual(hashlib.sha256(migration).hexdigest(),core._LEGACY_SHA256)
        query=core._legacy_probe_sql(migration)
        self.assertTrue(query.rstrip().endswith(b'ROLLBACK;'))
        self.assertNotIn(b'EXECUTE replace',query)
        for target in core._LEGACY_EXPECTED:self.assertIn(target.encode('ascii'),query)
        result={'status':'CORE_INSTALLED_DISABLED','core':core._CORE_OK,
                'legacyPredecessors':dict.fromkeys(core._LEGACY_EXPECTED,'MISSING'),'probeRolledBack':True}
        self.assertEqual(core.project_core_rehearsal(result),result)
        self.assertIsNone(core.project_core_rehearsal({**result,'probeRolledBack':False}))
        changed={**core._CORE_OK,'modeEnabled':True}
        self.assertIsNone(core.project_core_rehearsal({**result,'core':changed}))

    def test_launch_projection_binds_restored_cutoff_and_member_pins(self):
        expected={'rankingRunId':'00000000-0000-4000-8000-000000000001',
            'session':'2026-11-13','cutoff':'2026-11-13T13:30:00Z','headSha256':'0'*64,
            'members':[{'rank':1,'symbol':'1111','revisionId':'00000000-0000-4000-8000-000000000002',
                        'scoreRevision':'00000000-0000-4000-8000-000000000003',
                        'launchQualificationRevision':'00000000-0000-4000-8000-000000000004','inputHash':'1'*64}]}
        observed={'session':expected['session'],'ranked':1}
        self.assertEqual(m._expected_launch_binding(lambda _:json.dumps(expected),observed),expected)
        snapshot={key:expected[key] for key in ('rankingRunId','session','cutoff','members')}
        def request(value):
            return (200,{'cache-control':'no-store'},
                    json.dumps({'ok':True,'result':{'availability':'ready','snapshot':value}}).encode())
        self.assertEqual(m._launch_result(request(snapshot),expected)['snapshot'],snapshot)
        for changed in ({**snapshot,'session':'2026-11-12'},
                        {**snapshot,'cutoff':'2026-11-13T13:31:00Z'},
                        {**snapshot,'members':[{**snapshot['members'][0],'inputHash':'2'*64}]}):
            with self.assertRaises(m.FixedRollbackRejected):m._launch_result(request(changed),expected)

    def test_launch_success_receipt_rejects_frozen_b_drift_and_legacy_acl(self):
        from deployment.staging.vnext.t17_keyfd.t18_reader_roles import ROLE_COUNTS,LAUNCH_ROLE_COUNTS,LAUNCH_DETAIL_ROLE_COUNTS
        step={'sourceCommit':LAUNCH_RELEASE_PINS[0][0],'buildId':'build-a','nextVersion':'16.3.4',
            'homeStatus':200,'detailStatus':200,'staticStatus':200,'staticSha256':'a'*64,
            'snapshotSha256':'b'*64,'detailSha256':'c'*64,'session':'2026-11-13','ranked':1}
        switched={**step,'sourceCommit':LAUNCH_RELEASE_PINS[1][0],'buildId':'build-b','staticSha256':'d'*64}
        sequence={'sequence':'A_B_A','steps':[step,switched,step],'faultHealthFailed':True,
                  'automaticRollback':'A','recovered':step}
        result={'status':'FIXED_LAUNCH_RELEASE_ROLLBACK_VERIFIED','snapshotDataAndConstraintBitsUnchanged':True,
            'postgrestAcceptance':'FIXED_LAUNCH_READER_ONLY','nextRollback':'FIXED_LAUNCH_PAIR_VERIFIED',
            'namespaceKernelCookiesMatched':True,'threeDistinctOsUidsObserved':True,'ownedListenersClosed':True,
            'hostUnitCleanup':'HOST_REQUIRED','launchReadpoint':{'status':'FROZEN_RANK_ROWS_OBSERVED',
            'session':'2026-11-13','ranked':1},'readerRoleChecks':LAUNCH_ROLE_COUNTS,
            'negativeHttpChecks':{'proxyDenied':6,'postgrestDenied':2},'proxyMetrics':{'requests':20,
            'allowedReads':14,'blockedRequests':6,'upstreamFailures':0,'responseBytes':14000},'rollback':sequence}
        self.assertEqual(project_exercise(result),result)
        detail_projections=dict.fromkeys(m.LAUNCH_DETAIL_PROJECTION_KEYS,'PINNED')
        with_diagnostic={**result,'launchDetailProjections':detail_projections}
        self.assertIsNone(project_exercise(with_diagnostic))
        with_diagnostic['readerRoleChecks']=LAUNCH_DETAIL_ROLE_COUNTS
        self.assertEqual(project_exercise(with_diagnostic),with_diagnostic)
        partial={**detail_projections,'reviewedFalsifier':'MISSING'}
        self.assertIsNone(project_exercise({**with_diagnostic,'launchDetailProjections':partial}))
        compatible={**result,'launchDetailProjections':partial}
        self.assertEqual(project_exercise(compatible),compatible)
        self.assertIsNone(project_exercise({**result,'launchDetailProjections':{'reportedEps':'PINNED'}}))
        self.assertIsNone(project_exercise({**result,'readerRoleChecks':ROLE_COUNTS}))
        drift={**switched,'detailSha256':'0'*64}
        self.assertIsNone(project_exercise({**result,'rollback':{**sequence,'steps':[step,drift,step]}}))

    def test_public_python_only_actual_http_A_B_A_and_killed_B_rollback(self):
        broker=self.broker()
        self.assertNotEqual(broker.programs[0].read_bytes(),broker.programs[1].read_bytes())
        before=[m._static_asset(release)[1] for release in broker.releases]
        self.assertNotEqual(*before)
        result=m._execute_fixed_sequence(broker,object(),broker.releases,{'daily':EXPECTED,'home':EXPECTED})
        self.assertEqual(result['sequence'],'A_B_A')
        self.assertEqual([step['buildId'] for step in result['steps']],['fixtureA','fixtureB','fixtureA'])
        self.assertTrue(result['faultHealthFailed']);self.assertEqual(result['automaticRollback'],'A')
        self.assertEqual(result['recovered']['buildId'],'fixtureA')
        for step in [*result['steps'],result['recovered']]:
            self.assertTrue(step['staleReadonly']);self.assertFalse(step['actionsEnabled'])
            self.assertEqual(step['contentDate'],'2026-09-19')
            self.assertEqual(step['snapshotPublishedDate'],'2026-09-19')
            self.assertEqual(step['homeStatus'],200);self.assertEqual(step['staticStatus'],200)
        self.assertEqual(broker.ops,['START_A','STOP_NEXT','START_B','STOP_NEXT','START_A','STOP_NEXT',
            'START_B','FAULT_NEXT','START_A','STOP_NEXT'])
        self.assertEqual(before,[m._static_asset(release)[1] for release in broker.releases])
        self.assertEqual(len(broker.children),5);self.assert_clean(broker)
    def test_actual_http_changed_stale_authority_original_date_and_static_reject(self):
        for mode,code in (('stale','stale_readonly_or_authority_rejected'),
             ('authority','stale_readonly_or_authority_rejected'),('actions','stale_readonly_or_authority_rejected'),
             ('cache','stale_readonly_or_authority_rejected'),('date','original_snapshot_date_changed'),
             ('actionable','stale_actionable_stage_rejected'),('static','next_home_or_static_health_failed')):
            with self.subTest(public_fault=mode):
                # Separate generated directory per fault, no shared child state.
                with tempfile.TemporaryDirectory(prefix='t18-public-health-',dir='/tmp') as directory:
                    broker=PublicFixtureBroker(directory,mode)
                    try:
                        broker.request('START_A')
                        with self.assertRaisesRegex(m.FixedRollbackRejected,'^'+code+'$'):
                            m._health(broker.releases[0],EXPECTED)
                    finally:broker.close()
                    self.assert_clean(broker)


class JwtAndFrameMechanicsOnlyTests(unittest.TestCase):
    @staticmethod
    def signed(secret,claim):
        b64=lambda value:base64.urlsafe_b64encode(value).rstrip(b'=').decode()
        head=b64(b'{"alg":"HS256","typ":"JWT"}')
        body=b64(json.dumps(claim,separators=(',',':')).encode())
        signed=(head+'.'+body).encode()
        return signed.decode()+'.'+b64(hmac.new(secret,signed,hashlib.sha256).digest())
    def test_generated_staging_jwt_valid_and_wrong_key_expiry_role_reject(self):
        secret,token=jwt.create_stage_jwt()
        accepted=None
        try:
            request={'op':'CONFIGURE','stageJwt':token,'hmacSecretB64':base64.b64encode(secret).decode()}
            accepted,returned=jwt._validate_config(request)
            self.assertEqual(accepted,secret);self.assertEqual(returned,token)
            now=int(time.time())
            valid={'role':'t18_reader','aud':'stockinsider-t18','iat':now,'exp':now+900}
            wrong_key=dict(request,hmacSecretB64=base64.b64encode(b'P'*32).decode())
            invalid=[wrong_key]
            for changes in ({'exp':now-1},{'role':'service_role'},{'aud':'production'},
                            {'iat':True},{'exp':now+1800}):
                claim={**valid,**changes}
                invalid.append(dict(request,stageJwt=self.signed(secret,claim)))
            for value in invalid:
                with self.assertRaisesRegex(jwt.AppBrokerRejected,'^fixed_app_broker_rejected$'):
                    jwt._validate_config(value)
        finally:
            for data in (secret,accepted):
                if data is not None:
                    for i in range(len(data)):data[i]=0
    def test_actual_socket_frame_rejects_unknown_operation_and_caller_arguments(self):
        for value in ({'op':'EXEC'},{'op':'START_A','argv':['PUBLIC_FORBIDDEN']},
                      {'op':'HELLO','path':'PUBLIC_FORBIDDEN'}):
            left,right=socket.socketpair()
            try:
                body=json.dumps(value).encode();left.sendall(struct.pack('!I',len(body))+body)
                with self.assertRaises(jwt.AppBrokerRejected):jwt._recv_frame(right)
            finally:left.close();right.close()


if __name__=='__main__':unittest.main()

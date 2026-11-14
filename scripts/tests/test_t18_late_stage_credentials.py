"""Actual PG17/seals/SCM/JWT components, PUBLIC fixtures, no root admission.

Only wallclock is advanced for the >600s regression; no expensive sleep. Public
component success is never three-unit/native LoadCredential runtime acceptance.
"""
import array
from contextlib import nullcontext
import fcntl
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from deployment.staging.vnext.t17_keyfd import stage_credentials as c,late_stage_credentials as late
from deployment.staging.vnext.t17_keyfd import portable_restore_engine as engine,t18_readpoint_diagnostics as d
from test_t17_portable_restore_engine import public_archive


FIXTURE_RADAR=b'''ALTER TABLE public.radar_public_snapshots ALTER COLUMN id TYPE uuid USING lpad(id::text,32,'0')::uuid;
ALTER TABLE public.radar_public_snapshots
 ADD etag text,ADD content_as_of timestamptz,ADD published_at timestamptz,
 ADD payload_json jsonb,ADD window_key text,ADD status text;
CREATE TABLE public.radar_publication_state(window_key text,status text,last_attempt_at timestamptz,terminal_reason text);
INSERT INTO public.radar_public_snapshots(id,etag,content_as_of,published_at,payload_json,window_key,status) VALUES
 ('00000000-0000-4000-8000-000000000100','PUBLIC_ETAG','2026-09-19Z','2026-09-19Z','{"asOf":"2026-09-19Z"}','home','valid'),
 ('00000000-0000-4000-8000-000000000101','PUBLIC_ETAG','2026-09-19Z','2026-09-19Z','{"asOf":"2026-09-19Z"}','daily','valid');'''


class PublicBroker:
    def __init__(self):self.ops=[]
    def request(self,op,**_):self.ops.append(op);return {}


class LateStageCredentialTests(unittest.TestCase):
    def test_actual_signature_boundaries_599_600_601_and_lifetime_label(self):
        with patch.object(c.time,'time',return_value=100000):secret,token=c.create_stage_jwt()
        try:
            for elapsed in (599,600):
                with patch.object(c.time,'time',return_value=100000+elapsed):
                    self.assertEqual(c.validate_stage_token(secret,token),100900)
            for elapsed in (601,612,901):
                with patch.object(c.time,'time',return_value=100000+elapsed):
                    with self.assertRaises(c.StageCredentialRejected) as error:c.validate_stage_token(secret,token)
                    self.assertEqual(error.exception.category,'lifetime')
                    with self.assertRaises(c.StageCredentialRejected) as decoded:c._decode(c.MAGIC+secret+__import__('struct').pack('!H',len(token))+token.encode())
                    self.assertEqual(decoded.exception.category,'lifetime')
            # Auth/shape errors remain material; forged expiry never gets TTL label.
            with patch.object(c.time,'time',return_value=100612):
                with self.assertRaises(c.StageCredentialRejected) as wrong:c.validate_stage_token(b'X'*32,token)
                self.assertEqual(wrong.exception.category,'material')
        finally:secret[:]=bytes(32)

    def test_actual_pg17_restore_slow_clock_fresh_memfd_scm_and_cleanup(self):
        with tempfile.TemporaryDirectory(prefix='t18-late-pg-',dir='/tmp') as directory:
            os.chmod(directory,0o700);archive=public_archive(directory,large_rows=2)
            with patch.object(c.time,'time',return_value=100000):old_secret,old_token=c.create_stage_jwt()
            left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
            try:
                with engine._owned_validated_clone(lambda consume:consume(archive),Path(directory)) as clone:
                    component_failure=None
                    try:
                        self.assertEqual(int(clone.receipt['serverVersionNum'])//10000,17)
                        self.assertEqual(clone._ValidatedClone__sql(b'SELECT count(*) FROM public.stocks'),'2')
                        self.assertEqual(clone._ValidatedClone__sql(b'SELECT count(*) FROM public.stock_signals'),'12')
                        # The clock represents time spent on real restore/verification;
                        # actual PG and all existing engine checks ran above.
                        with patch.object(c.time,'time',return_value=100612):
                            with self.assertRaises(c.StageCredentialRejected):c.validate_stage_token(old_secret,old_token)
                            secret,token=c.create_stage_jwt();fd=c._seal_public_or_stage_bytes(c._encode(secret,token))
                            try:
                                self.assertEqual(c.validate_stage_token(secret,token),101512)
                                c.send_stage_fd(left,fd);received=c.receive_stage_fd(right)
                                try:
                                    self.assertEqual(fcntl.fcntl(received,c.F_GET_SEALS)&c.REQUIRED_SEALS,c.REQUIRED_SEALS)
                                    with self.assertRaises(OSError):os.pwrite(received,b'X',0)
                                    copied,jwt=c._decode(os.pread(received,c.MAX_MATERIAL+1,0))
                                    self.assertEqual(jwt,token);self.assertEqual(c.validate_stage_token(copied,jwt),101512)
                                    copied[:]=bytes(32)
                                finally:os.close(received)
                            finally:os.close(fd);secret[:]=bytes(32)
                    except Exception as error:component_failure=error
                if component_failure is not None:raise component_failure
                self.assertTrue(all(clone.receipt['cleanup'].values()));self.assertEqual(list(Path(directory).iterdir()),[])
            finally:old_secret[:]=bytes(32);left.close();right.close()

    def test_actual_validated_clone_typed_lifetime_and_cleanup_diagnostic(self):
        with tempfile.TemporaryDirectory(prefix='t18-late-diag-',dir='/tmp') as directory:
            os.chmod(directory,0o700);archive=public_archive(directory,large_rows=2)
            app=PublicBroker();rest=PublicBroker();activated=[]
            with self.assertRaises(engine.RestoreEngineRejected) as error:
                with engine._owned_validated_clone(lambda consume:consume(archive),Path(directory)) as clone:
                    # Fixture-only schema, after actual original engine gates. It
                    # does not grant runtime authority or change archive fixtures.
                    clone._ValidatedClone__sql(FIXTURE_RADAR)
                    clone._ValidatedClone__rest_socket=lambda:activated.append(True)
                    with patch('deployment.staging.vnext.t17_keyfd.late_stage_credentials.request_fresh_stage',side_effect=c.StageCredentialRejected('lifetime')):
                        clone.rehearse_fixed_next(app,rest,object())
            self.assertEqual(str(error.exception),'t18_stage_credential_lifetime_failed')
            self.assertEqual(d.readpoint_after_cleanup(error.exception),{'phase':'stage_credential_lifetime','errorClass':'stage_lifetime','ownedCloneCleanupVerified':True})
            self.assertEqual(app.ops,['SHUTDOWN']);self.assertEqual(rest.ops,[]);self.assertEqual(activated,[True])
            self.assertEqual(list(Path(directory).iterdir()),[])

    def test_actual_pg_readpoint_scopes_fail_closed_before_broker_configure(self):
        from deployment.staging.vnext.t17_keyfd import radar_reader_observation as radar,t18_reader_roles as roles
        for phase in ('radar_readpoint','reader_role_install','owned_socket_activation','candidate_detail_query'):
            with self.subTest(phase=phase),tempfile.TemporaryDirectory(prefix='t18-phase-pg-',dir='/tmp') as directory:
                os.chmod(directory,0o700);archive=public_archive(directory,large_rows=2)
                app=PublicBroker();rest=PublicBroker()
                with self.assertRaises(engine.RestoreEngineRejected) as error:
                    with engine._owned_validated_clone(lambda consume:consume(archive),Path(directory)) as clone:
                        actual_sql=clone._ValidatedClone__sql
                        actual_sql(FIXTURE_RADAR)
                        def observed_sql(query):
                            if ((phase=='radar_readpoint' and query==radar.READER_OBSERVATION_SQL)
                                or (phase=='reader_role_install' and query==roles.FIXED_READER_ROLE_SQL)
                                or phase=='candidate_detail_query'):
                                raise OSError('PUBLIC_QUERY_OR_ROW_DO_NOT_EXPORT')
                            return actual_sql(query)
                        clone._ValidatedClone__sql=observed_sql
                        def socket_refusal():raise OSError('PUBLIC_SOCKET_PATH_DO_NOT_EXPORT')
                        clone._ValidatedClone__rest_socket=socket_refusal
                        if phase=='candidate_detail_query':clone.observe_candidate_detail()
                        else:clone.rehearse_fixed_next(app,rest,object())
                self.assertEqual(d.readpoint_after_cleanup(error.exception),{'phase':phase,'errorClass':'os_error','ownedCloneCleanupVerified':True})
                self.assertEqual(app.ops,[]);self.assertEqual(rest.ops,[])
                self.assertEqual(list(Path(directory).iterdir()),[])

    def test_actual_pg_primary_broker_failure_survives_cleanup_failure(self):
        class RefusingBroker(PublicBroker):
            def request(self,op,**_):
                self.ops.append(op)
                raise OSError('PUBLIC_BROKER_CONTENT_DO_NOT_EXPORT')
        with tempfile.TemporaryDirectory(prefix='t18-primary-pg-',dir='/tmp') as directory:
            os.chmod(directory,0o700);archive=public_archive(directory,large_rows=2)
            app=PublicBroker();rest=RefusingBroker();fresh=PublicBroker()
            secret,token=c.create_stage_jwt()
            with self.assertRaises(engine.RestoreEngineRejected) as error:
                with engine._owned_validated_clone(lambda consume:consume(archive),Path(directory)) as clone:
                    clone._ValidatedClone__sql(FIXTURE_RADAR)
                    clone._ValidatedClone__rest_socket=lambda:None
                    # Private SQL/control error-routing only. These injected
                    # handles never pass or replace any public OS entry guard.
                    with patch('deployment.staging.vnext.t17_keyfd.late_stage_credentials.request_fresh_stage',return_value=(secret,token)), \
                         patch('deployment.staging.vnext.t17_keyfd.t18_broker_transport.connect_fixed_app_broker',return_value=nullcontext(fresh)), \
                         patch('deployment.staging.vnext.t17_keyfd.t18_runtime_observation.observe_three_uid_budget',return_value=None):
                        clone.rehearse_fixed_next(app,rest,object())
            self.assertEqual(d.readpoint_after_cleanup(error.exception),{'phase':'rest_configure','errorClass':'os_error','ownedCloneCleanupVerified':True})
            self.assertEqual(rest.ops,['CONFIGURE','SHUTDOWN']);self.assertEqual(fresh.ops,['SHUTDOWN'])
            self.assertEqual(secret,bytes(32));self.assertEqual(list(Path(directory).iterdir()),[])

    def test_fixed_phase_unknown_errors_never_export_text_and_earliest_wins(self):
        for phase in sorted(d.PHASES):
            with self.assertRaises(d.ReadpointRejected) as error:
                with d.readpoint_phase(phase):raise RuntimeError('PUBLIC_SQL_ROW_STACK_TOKEN_DO_NOT_EXPORT')
            self.assertEqual(error.exception.diagnostic,{'phase':phase,'errorClass':'unexpected'})
            self.assertNotIn('DO_NOT_EXPORT',str(error.exception)+json.dumps(error.exception.diagnostic))
        with self.assertRaises(d.ReadpointRejected) as error:
            with d.readpoint_phase('fixed_http_exercise'):
                with d.readpoint_phase('final_token_check'):raise c.StageCredentialRejected('lifetime')
        self.assertEqual(error.exception.diagnostic['phase'],'stage_credential_lifetime')
        from deployment.staging.vnext.t17_keyfd.t18_broker_transport import BrokerTransportRejected
        for failure,kind in ((TimeoutError('PUBLIC_RAW'),'timeout'),(OSError('PUBLIC_RAW'),'os_error'),
            (json.JSONDecodeError('PUBLIC_RAW','PUBLIC_RAW',0),'parse_error'),
            (engine.RestoreEngineRejected('PUBLIC_RAW'),'rejected'),(BrokerTransportRejected('PUBLIC_RAW'),'rejected')):
            with self.assertRaises(d.ReadpointRejected) as refused:
                with d.readpoint_phase('radar_readpoint'):raise failure
            self.assertEqual(refused.exception.diagnostic,{'phase':'radar_readpoint','errorClass':kind})
            self.assertNotIn('PUBLIC_RAW',str(refused.exception))
        for value in ({'phase':'SQL','errorClass':'unexpected'},{'phase':'radar_readpoint','errorClass':'unexpected','raw':'secret'},True):
            self.assertIsNone(d.project_readpoint_diagnostic(value))
        error=engine.RestoreEngineRejected('PUBLIC_FIXED');error.readpoint_diagnostic={'phase':'radar_readpoint','errorClass':'unexpected'}
        self.assertIsNone(d.readpoint_after_cleanup(error))
        error.diagnostic_cleanup={'postmasterReaped':True,'socketRemoved':True,'privateTreeRemoved':False}
        self.assertIsNone(d.readpoint_after_cleanup(error))

    def test_actual_ready_packet_rejects_rights_truncation_duplicate_and_eof(self):
        for payload,rights in ((b'X',False),(b'JJ',False),(b'JJJ',False),(b'J',True),(b'',False)):
            left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET);fd=os.memfd_create('PUBLIC_MARKER',os.MFD_CLOEXEC)
            try:
                if payload:left.sendmsg([payload],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[fd]))] if rights else [])
                else:left.close()
                baseline=len(os.listdir('/proc/self/fd'))
                with self.assertRaises(c.StageCredentialRejected):late.receive_ready(right)
                self.assertEqual(len(os.listdir('/proc/self/fd')),baseline)
            finally:left.close();right.close();os.close(fd)
        left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
        try:left.send(b'J');late.receive_ready(right)
        finally:left.close();right.close()

    def test_actual_duplicate_ready_records_refuse_before_material_issuance(self):
        left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
        try:
            left.send(b'J');left.send(b'J')
            with self.assertRaises(c.StageCredentialRejected):late.receive_ready(right)
        finally:left.close();right.close()

    def test_actual_child_eight_fd_collision_mapping_and_channel_cloexec(self):
        code=r"""
import fcntl,os,socket,sys
sys.path.insert(0,sys.argv[1])
from deployment.staging.vnext.t17_keyfd import t18_fd_handoff as h,late_stage_credentials as late,stage_credentials as c
originals=[]
for i in range(7):
 fd=os.memfd_create('PUBLIC_MARKER',os.MFD_CLOEXEC);os.write(fd,('PUBLIC_'+str(i)).encode())
 originals.append(fcntl.fcntl(fd,fcntl.F_DUPFD_CLOEXEC,40));os.close(fd)
a,b=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
channel=fcntl.fcntl(b.fileno(),fcntl.F_DUPFD_CLOEXEC,90)
aa=fcntl.fcntl(a.fileno(),fcntl.F_DUPFD_CLOEXEC,90);a.close();b.close();a=socket.socket(fileno=aa)
h.install_fixed_fds(originals[:6]);h.install_stage_and_channel(originals[6],channel)
assert [os.pread(fd,64,0) for fd in range(3,10)]==[('PUBLIC_'+str(i)).encode() for i in range(7)]
assert all(os.get_inheritable(fd) for fd in range(3,11))
try:late.observe_root_channel()
except c.StageCredentialRejected:pass
else:raise AssertionError('PUBLIC_NONROOT_MUST_REFUSE')
assert not os.get_inheritable(10)
a.send(b'J');probe=socket.socket(fileno=os.dup(10));late.receive_ready(probe);probe.close();a.close()
for fd in (3,4,5,10,9,8,7,6):os.close(fd)
print('PUBLIC_EIGHT_FD_MAPPING_AND_CHANNEL_CLOEXEC_VERIFIED')
"""
        result=subprocess.run([sys.executable,'-I','-B','-c',code,str(Path(__file__).resolve().parents[2])],capture_output=True,timeout=5)
        self.assertEqual(result.returncode,0,result.stderr.decode())
        self.assertEqual(result.stdout,b'PUBLIC_EIGHT_FD_MAPPING_AND_CHANNEL_CLOEXEC_VERIFIED\n')

    def test_actual_nonroot_root_channel_and_root_bootstrap_refusals(self):
        left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
        try:
            with patch.object(late,'CHANNEL_FD',right.fileno()):
                with self.assertRaises(c.StageCredentialRejected):late.observe_root_channel()
            with self.assertRaises(c.StageCredentialRejected):late.create_root_bootstrap()
        finally:left.close();right.close()


if __name__=='__main__':unittest.main()

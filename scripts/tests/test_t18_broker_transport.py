"""Actual private AF_UNIX framing tests; never a mocked runtime peer grant."""
import base64
import json
import os
from pathlib import Path
import socket
import struct
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from deployment.staging.vnext.t17_keyfd import t18_broker_transport as m


def response(op='HELLO'):
    return {'op':op,'status':m.STATUS[op],'sourceCommit':None,'buildId':None,
            'postgrestVersion':None,'nextVersion':None,'nextRunning':False,'postgrestRunning':False,
            'networkNamespaceCookie':1}


class BrokerTransportTests(unittest.TestCase):
    def test_actual_cloud_fixed_control_path_rejects(self):
        for connector in (m.connect_fixed_app_broker,m.connect_fixed_rest_broker):
            with self.assertRaises(m.BrokerTransportRejected):
                with connector():self.fail('no_runtime_control_path')
            with self.assertRaises(TypeError):connector(ready=True)

    def test_fixed_rest_profile_cannot_use_next_operations(self):
        # Frozen object is only a private wire helper fixture, not runtime proof.
        left,right=socket.socketpair()
        try:
            broker=m._ConnectedBroker(100,100,100,'si-t18-rest',left,'rest')
            for op in ('START_A','START_B','STOP_NEXT','FAULT_NEXT'):
                with self.assertRaisesRegex(m.BrokerTransportRejected,'broker_profile_operation_rejected'):
                    broker.request(op)
        finally:left.close();right.close()

    def test_database_socket_group_separation_is_not_a_caller_flag(self):
        m._validate_group_profile({10},20,'app')
        m._validate_group_profile({10,20},20,'rest')
        for groups,profile in (({10,20},'app'),({10},'rest'),({10},'caller_verified')):
            with self.assertRaises(m.BrokerTransportRejected):m._validate_group_profile(groups,20,profile)
        with self.assertRaises(m.BrokerTransportRejected):
            with m._connect_profile('/tmp/forbidden','si-t18-rest'):self.fail('external_profile')

    def test_actual_kernel_namespace_cookie_equal_across_unbound_socket_families(self):
        actual=m.observe_network_namespace_cookie()
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as unix:
            unix_cookie=struct.unpack('=Q',unix.getsockopt(socket.SOL_SOCKET,m.SO_NETNS_COOKIE,8))[0]
        self.assertEqual(actual,unix_cookie)
        self.assertGreater(actual,0)

    def test_wrong_or_forged_hello_cookie_is_rejected(self):
        actual=m.observe_network_namespace_cookie()
        for wrong in (0,True,None,actual+1):
            with self.assertRaises(m.BrokerTransportRejected):m._require_namespace_cookie(wrong,actual)
        for wrong in (0,True,-1,2**64,'caller_verified'):
            data=response();data['networkNamespaceCookie']=wrong
            with self.assertRaises(m.BrokerTransportRejected):m._response(json.dumps(data).encode(),'HELLO')

    def test_private_identity_helper_refuses_admin_same_uid_or_missing_group(self):
        for uid,user,groups in ((0,'root',{123}),(100,'postgres',{123}),(100,'portable_reader',{123}),
                                (100,'stageadmin',{123}),(100,'stage_broker',set()),(99,'stage_broker',{123})):
            with self.assertRaises(m.BrokerTransportRejected):m._validate_peer_identity(uid,user,groups,123,99)
        # Pure predicate only: no socket or runtime accepted result is minted.
        m._validate_peer_identity(100,'stage_broker',{123},123,99)
        m._validate_peer_identity(100,'si-t18-app',{123},123,99)
        self.assertEqual(m.BROKER_USERNAME,'si-t18-app')

    def test_actual_unix_socket_framing_and_projected_response(self):
        with tempfile.TemporaryDirectory() as directory:
            path=str(Path(directory)/'public.sock')
            server=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);server.bind(path);server.listen(1)
            seen=[]
            def serve():
                conn,_=server.accept()
                with conn:
                    size=struct.unpack('!I',m._receive(conn,4))[0]
                    seen.append(json.loads(m._receive(conn,size)))
                    data=json.dumps(response()).encode();conn.sendall(struct.pack('!I',len(data))+data)
            t=threading.Thread(target=serve);t.start()
            client=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
            try:
                client.connect(path)
                result=m._exchange(client,'HELLO',{})
                self.assertEqual(result,response())
            finally:
                client.close();t.join(timeout=3);server.close()
            self.assertFalse(t.is_alive());self.assertEqual(seen,[{'op':'HELLO'}])

    def test_accepts_start_receipts_for_both_fixed_release_pairs(self):
        for pair in (m.RELEASE_PINS, m.LAUNCH_RELEASE_PINS):
            for op, (commit, _) in zip(('START_A', 'START_B'), pair, strict=True):
                with self.subTest(op=op, commit=commit):
                    value = {**response(op), 'sourceCommit': commit, 'buildId': 'fixed-build',
                             'nextVersion': '16.3.4', 'nextRunning': True}
                    self.assertEqual(m._response(json.dumps(value).encode(), op)['sourceCommit'], commit)

    def test_rejects_start_receipt_for_unpinned_release(self):
        value = {**response('START_A'), 'sourceCommit': '0' * 40, 'buildId': 'fixed-build',
                 'nextVersion': '16.3.4', 'nextRunning': True}
        with self.assertRaisesRegex(m.BrokerTransportRejected, '^broker_response_rejected$'):
            m._response(json.dumps(value).encode(), 'START_A')

    def test_secret_fields_cannot_be_echoed_or_reported(self):
        secret='PUBLIC_FAKE_SECRET_DO_NOT_ECHO'
        invalid=response();invalid['stageJwt']=secret
        with self.assertRaisesRegex(m.BrokerTransportRejected,'^broker_response_rejected$') as error:
            m._response(json.dumps(invalid).encode(),'HELLO')
        self.assertNotIn(secret,str(error.exception))
        denied=response();denied['status']='REJECTED'
        with self.assertRaisesRegex(m.BrokerTransportRejected,'^broker_operation_refused$'):
            m._response(json.dumps(denied).encode(),'HELLO')

    def test_only_finite_operations_and_configuration_fields(self):
        fields={'stageJwt':'a.b.c','hmacSecretB64':base64.b64encode(b'PUBLIC_FIXTURE_HMAC_BYTES_ONLY_32').decode()}
        self.assertEqual(json.loads(m._request_payload('CONFIGURE',fields))['op'],'CONFIGURE')
        for op,values in (('EXEC',{}),('START_A',{'argv':['evil']}),('HELLO',{'path':'forbidden'}),
                          ('CONFIGURE',{'stageJwt':'x','hmacSecretB64':'wrong'})):
            with self.assertRaises(m.BrokerTransportRejected):m._request_payload(op,values)

    def test_truncated_and_oversize_frames_are_bounded(self):
        for payload in (struct.pack('!I',m.MAX_MESSAGE+1),struct.pack('!I',100)+b'{}'):
            left,right=socket.socketpair()
            def serve():
                try:
                    size=struct.unpack('!I',m._receive(right,4))[0];m._receive(right,size)
                    right.sendall(payload)
                finally:right.close()
            t=threading.Thread(target=serve);t.start()
            try:
                with self.assertRaises(m.BrokerTransportRejected):m._exchange(left,'HELLO',{})
            finally:left.close();t.join(timeout=3)
            self.assertFalse(t.is_alive())

    def test_actual_drip_response_cannot_extend_absolute_request_deadline(self):
        left,right=socket.socketpair()
        def serve():
            try:
                size=struct.unpack('!I',m._receive(right,4))[0];m._receive(right,size)
                data=json.dumps(response()).encode()
                # Every byte arrives sooner than the per-recv timeout. Only
                # an absolute wall timer interrupts this otherwise-long stream.
                for byte in struct.pack('!I',len(data))+data:
                    right.sendall(bytes([byte]));time.sleep(.015)
            except (OSError,m.BrokerTransportRejected):pass
            finally:right.close()
        t=threading.Thread(target=serve);t.start();start=time.monotonic()
        try:
            with patch.object(m,'SHORT_REQUEST_SECONDS',.08):
                with self.assertRaisesRegex(m.BrokerTransportRejected,'^broker_ipc_deadline$'):
                    m._exchange(left,'HELLO',{})
            self.assertLess(time.monotonic()-start,.8)
        finally:left.close();t.join(timeout=1)
        self.assertFalse(t.is_alive())


if __name__=='__main__':unittest.main()

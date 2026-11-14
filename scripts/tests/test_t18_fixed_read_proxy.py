"""Actual private loopback HTTP, generated payload/token only; no DB/remote."""
import http.client
import http.server
import json
import socket
import threading
import time
import unittest
from unittest.mock import patch
from urllib.parse import urlencode
from deployment.staging.vnext.t17_keyfd import fixed_read_proxy as m

TOKEN='PUBLIC_HEADER.'+'PUBLIC_STAGING_CLAIM_'*4+'.'+'PUBLIC_SIGNATURE_'*3
SNAP='/rest/v1/radar_public_snapshots?'+urlencode({'select':m.SNAPSHOT_SELECT,'window_key':'eq.daily','status':'eq.valid','order':'published_at.desc','limit':'1'})
STATE='/rest/v1/radar_publication_state?'+urlencode({'select':m.STATE_SELECT,'window_key':'eq.home'})


class FixedReadProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.seen=[];cls.mode='normal'
        class Upstream(http.server.BaseHTTPRequestHandler):
            def log_message(self,*_):pass
            def do_GET(self):self.answer()
            def do_HEAD(self):self.answer()
            def answer(self):
                cls.seen.append((self.command,self.path,self.headers.get('Authorization'),self.headers.get('apikey')))
                if cls.mode=='redirect':
                    self.send_response(302);self.send_header('Location','http://PUBLIC_FORBIDDEN_TARGET/');self.end_headers();return
                self.send_response(200)
                self.send_header('Content-Type','application/vnd.pgrst.object+json' if cls.mode=='singular' else 'application/json')
                self.send_header('Content-Length',str(m.RESPONSE_BYTES_LIMIT+1) if cls.mode=='oversize' else '2')
                if cls.mode=='headers':self.send_header('X-Public-Fixture','A'*9000)
                self.end_headers()
                if cls.mode=='slow':
                    self.wfile.write(b'[');self.wfile.flush();time.sleep(.4)
                    try:self.wfile.write(b']')
                    except OSError:pass
                elif self.command!='HEAD' and cls.mode!='oversize':self.wfile.write(b'[]')
        class Server(http.server.HTTPServer):allow_reuse_address=True
        cls.server=Server(('127.0.0.1',3301),Upstream)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=False);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=2)
    def setUp(self):type(self).mode='normal';type(self).seen.clear()
    def request(self,method,path,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',3302,timeout=5)
        try:
            conn.request(method,path,headers=headers or {})
            response=conn.getresponse();return response.status,response.read(),dict(response.headers)
        finally:conn.close()
    def test_exact_get_head_and_fixed_token_replacement(self):
        with m.start_fixed_read_proxy(TOKEN) as handle:
            for method,path in (('GET',SNAP),('GET',STATE),('HEAD',SNAP)):
                status,body,_=self.request(method,path,{'Authorization':'Bearer PUBLIC_ESCALATION','apikey':'PUBLIC_ESCALATION'})
                self.assertEqual(status,200);self.assertEqual(body,b'' if method=='HEAD' else b'[]')
            self.assertEqual(handle.metrics['allowedReads'],3)
        self.assertTrue(handle.closed)
        self.assertTrue(all(row[2]=='Bearer '+TOKEN and row[3] is None for row in self.seen))
        self.assertTrue(all(row[1].startswith(('/radar_public_snapshots?','/radar_publication_state?')) for row in self.seen))
        self.assertNotIn(TOKEN,json.dumps(handle.metrics))
        with socket.socket() as sock:self.assertNotEqual(sock.connect_ex(('127.0.0.1',3302)),0)
    def test_writes_rpc_encoded_and_absolute_targets_rejected_without_upstream(self):
        with m.start_fixed_read_proxy(TOKEN) as handle:
            for method,path in (('POST',SNAP),('DELETE',STATE),('PATCH',SNAP),
               ('GET','/rest/v1/rpc/public_fixture'),('GET','http://127.0.0.1:3301/'+SNAP),
               ('GET','/rest/v1/%72adar_public_snapshots?x=y'),('GET','/rest/v1/../radar_public_snapshots?x=y'),
               ('GET','/'+SNAP),
               ('GET',SNAP+'&limit=9'),('GET',STATE+'&order=window_key.desc'),('GET',SNAP.replace('eq.daily','eq.weekly'))):
                self.assertGreaterEqual(self.request(method,path)[0],400)
            self.assertEqual(self.seen,[])
            self.assertEqual(handle.metrics['allowedReads'],0)
    def test_host_body_and_header_budget_rejected(self):
        with m.start_fixed_read_proxy(TOKEN):
            for headers in ({'Host':'PUBLIC_FORBIDDEN_TARGET:3301'}, {'Content-Length':'1'}, {'Transfer-Encoding':'chunked'}, {'X-Public-Fixture':'A'*9000}):
                self.assertGreaterEqual(self.request('GET',SNAP,headers)[0],400)
            self.assertEqual(self.seen,[])
    def test_upstream_redirect_oversize_and_headers_never_escape(self):
        with m.start_fixed_read_proxy(TOKEN) as handle:
            for mode in ('redirect','oversize','headers'):
                type(self).mode=mode
                status,body,headers=self.request('GET',SNAP)
                self.assertEqual(status,502);self.assertNotIn('Location',headers)
                self.assertNotIn(b'PUBLIC_FORBIDDEN_TARGET',body)
            self.assertEqual(handle.metrics['upstreamFailures'],3)
    def test_invalid_token_or_external_target_arguments_never_start(self):
        for value in ('short','A'*70+'\r\nPUBLIC',True):
            with self.assertRaises(m.FixedReadProxyRejected):
                with m.start_fixed_read_proxy(value):self.fail('server_started')
        with self.assertRaises(TypeError):m.start_fixed_read_proxy(TOKEN,target='http://PUBLIC_FORBIDDEN/')
    def test_native_singular_json_response_is_allowed(self):
        type(self).mode='singular'
        with m.start_fixed_read_proxy(TOKEN):
            status,body,headers=self.request('GET',SNAP,{'Accept':'application/vnd.pgrst.object+json'})
            self.assertEqual(status,200);self.assertEqual(body,b'[]')
            self.assertEqual(headers['Content-Type'],'application/vnd.pgrst.object+json')

    def test_inbound_drip_has_absolute_wall_and_context_closes_active_headers(self):
        with patch.object(m,'REQUEST_WALL_SECONDS',.15):
            with m.start_fixed_read_proxy(TOKEN) as handle:
                connection=socket.create_connection(('127.0.0.1',3302),timeout=1)
                connection.sendall(b'GET '+SNAP.encode()+b' HTTP/1.1\r\nHost: 127.0.0.1:3302\r\nX-Public-Fixture: ')
                started=time.monotonic()
                for _ in range(5):
                    time.sleep(.04)
                    try:connection.sendall(b'A')
                    except OSError:break
                connection.settimeout(.4)
                try:self.assertEqual(connection.recv(1),b'')
                except ConnectionResetError:pass
                self.assertLess(time.monotonic()-started,.5)
                connection.close()
            self.assertTrue(handle.closed)
        # Exit before the normal12s request deadline: active accepted header
        # parsing must be interrupted BEFORE blocking HTTPServer.shutdown().
        started=time.monotonic()
        with m.start_fixed_read_proxy(TOKEN) as handle:
            connection=socket.create_connection(('127.0.0.1',3302),timeout=1)
            connection.sendall(b'GET / HTTP/1.1\r\nHost: ')
            time.sleep(.03)
        connection.close()
        self.assertLess(time.monotonic()-started,.7)
        self.assertTrue(handle.closed);self.assertEqual(self.seen,[])

    def test_wall_deadline_closes_response_transport_after_connection_close_headers(self):
        type(self).mode='slow'
        # Lower the fixed deadline for a fast actual-HTTP fault injection; no
        # caller/API override or synthetic transport success is introduced.
        with patch.object(m,'UPSTREAM_WALL_SECONDS',.1):
            with m.start_fixed_read_proxy(TOKEN) as handle:
                started=time.monotonic();status,_,_=self.request('GET',SNAP)
                self.assertEqual(status,502);self.assertLess(time.monotonic()-started,.35)
                self.assertEqual(handle.metrics['upstreamFailures'],1)


if __name__=='__main__':unittest.main()

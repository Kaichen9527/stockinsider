"""Actual private loopback HTTP, generated payload/token only; no DB/remote."""
import http.client
import http.server
import json
import socket
import threading
import time
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs,urlencode,urlsplit
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
                if cls.mode=='bound_detail':
                    args=parse_qs(urlsplit(self.path).query)
                    body=json.dumps({'rankingRunId':args['p_ranking_run_id'][0],
                                     'symbol':args['p_symbol'][0]}).encode()
                    if self.path.startswith('/rpc/vnext_launch_reviewed_falsifier_v1'):
                        body=body.replace(b'6488',b'0000')
                    self.send_response(200)
                    self.send_header('Content-Type','application/json')
                    self.send_header('Content-Length',str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                if cls.mode=='redirect':
                    self.send_response(302);self.send_header('Location','http://PUBLIC_FORBIDDEN_TARGET/');self.end_headers();return
                if cls.mode in ('missing_projection','private_projection_failure'):
                    self.send_response(404 if cls.mode=='missing_projection' else 403)
                    payload=json.dumps({'code':'PGRST202' if cls.mode=='missing_projection' else '42501',
                                        'details':'GENERATED_PRIVATE_MARKER'}).encode()
                    self.send_header('Content-Type','application/json')
                    self.send_header('Content-Length',str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                    return
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
    def request(self,method,path,headers=None,body=None):
        conn=http.client.HTTPConnection('127.0.0.1',3302,timeout=5)
        try:
            conn.request(method,path,body=body,headers=headers or {})
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

    def test_launch_projection_rebuilds_readonly_query_and_preserves_legacy_get(self):
        headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json','apikey':'GENERATED_UNUSED'}
        run='00000000-0000-4000-8000-000000000018'
        with m.start_fixed_read_proxy(TOKEN,allow_launch_reads=True) as handle:
            for route,run_id,symbol in ((m.LAUNCH_RANKING_PATH,None,None),
                                        (m.LAUNCH_RANKING_PATH,run,None),
                                        (m.LAUNCH_RANKING_PATH,None,'6488'),
                                        (m.LAUNCH_OUTCOME_PATH,run,'6488')):
                body=json.dumps({'p_ranking_run_id':run_id,'p_symbol':symbol})
                self.assertEqual(self.request('POST',route,headers,body)[0],200)
            self.assertEqual(self.request('GET',STATE)[0],200)
            self.assertEqual(handle.metrics['allowedReads'],5)
        self.assertEqual([row[0] for row in self.seen],['GET']*5)
        self.assertEqual([row[1] for row in self.seen[:4]],[
            '/rpc/vnext_launch_ranking_read_v1',
            '/rpc/vnext_launch_ranking_read_v1?p_ranking_run_id='+run,
            '/rpc/vnext_launch_ranking_read_v1?p_symbol=6488',
            '/rpc/vnext_launch_outcome_public_v1?p_ranking_run_id='+run+'&p_symbol=6488',
        ])
        self.assertTrue(all(row[2]=='Bearer '+TOKEN and row[3] is None for row in self.seen))

    def test_five_details_use_only_the_frozen_run_and_ranked_symbols(self):
        headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'}
        run='00000000-0000-4000-8000-000000000018'
        request=lambda run,symbol:json.dumps({'p_ranking_run_id':run,'p_symbol':symbol})
        routes=sorted(m.DETAIL_PROJECTION_PATHS)
        self.assertEqual(len(routes),5)
        type(self).mode='bound_detail'
        with m.start_fixed_read_proxy(TOKEN,allow_launch_reads=True):
            for route in routes:
                self.assertEqual(self.request('POST',route,headers,request(run,'6488'))[0],403)
        self.assertEqual(self.seen,[])
        with m.start_fixed_read_proxy(TOKEN,allow_launch_reads=True,launch_detail_scope=(run,frozenset({'6488'}))) as h:
            for route in routes:
                for rejected in (request(run,'2330'),request(None,'6488'),request(run,None),
                                 request('00000000-0000-4000-8000-000000000019','6488')):
                    self.assertEqual(self.request('POST',route,headers,rejected)[0],403)
                status,body,_=self.request('POST',route,headers,request(run,'6488'))
                if route.endswith('reviewed_falsifier_v1'):
                    self.assertEqual(status,502)
                    self.assertNotIn(b'0000',body)
                else:
                    self.assertEqual(status,200)
                    self.assertEqual(json.loads(body),{'rankingRunId':run,'symbol':'6488'})
            self.assertEqual(h.metrics['upstreamFailures'],1)
        self.assertEqual([row[:2] for row in self.seen],[
            ('GET',route.removeprefix('/rest/v1')+'?p_ranking_run_id='+run+'&p_symbol=6488')
            for route in routes])

    def test_launch_projection_is_default_off_and_bounded(self):
        headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'}
        body='{"p_ranking_run_id":null,"p_symbol":null}'
        with m.start_fixed_read_proxy(TOKEN):
            self.assertEqual(self.request('POST',m.LAUNCH_RANKING_PATH,headers,body)[0],405)
        with m.start_fixed_read_proxy(TOKEN,allow_launch_reads=True) as handle:
            negative=[
                (m.LAUNCH_RANKING_PATH,{**headers,'Authorization':'Bearer GENERATED_WRONG'},body),
                (m.LAUNCH_RANKING_PATH,{**headers,'Content-Profile':'private'},body),
                (m.LAUNCH_RANKING_PATH,{**headers,'Prefer':'tx=commit'},body),
                (m.LAUNCH_RANKING_PATH+'?p_symbol=6488',headers,body),
                (m.LAUNCH_RANKING_PATH,headers,'{"p_ranking_run_id":null,"p_symbol":null,"p_symbol":"6488"}'),
                (m.LAUNCH_RANKING_PATH,headers,'{"p_ranking_run_id":null,"p_symbol":{"nested":6488}}'),
                (m.LAUNCH_RANKING_PATH,headers,'{"p_ranking_run_id":null,"p_symbol":"６４８８"}'),
                (m.LAUNCH_RANKING_PATH,headers,body+' '*128),
                (m.LAUNCH_OUTCOME_PATH,headers,body),
                ('/rest/v1/rpc/not_a_launch_projection',headers,body),
            ]
            for path,values,data in negative:
                with self.subTest(path=path):
                    self.assertEqual(self.request('POST',path,values,data.encode())[0],403)
            self.assertEqual(self.request('GET',m.LAUNCH_RANKING_PATH,headers)[0],403)
            self.assertEqual(handle.metrics['allowedReads'],0)
        self.assertEqual(self.seen,[])
        with self.assertRaises(m.FixedReadProxyRejected):
            with m.start_fixed_read_proxy(TOKEN,allow_launch_reads='true'):
                self.fail('invalid_option_started_proxy')

    def test_launch_projection_exposes_only_known_error_code(self):
        headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'}
        body='{"p_ranking_run_id":null,"p_symbol":null}'
        with m.start_fixed_read_proxy(TOKEN,allow_launch_reads=True):
            for mode,expected in (
                ('missing_projection',(404,'PGRST202')),
                ('private_projection_failure',(403,'fixed_launch_reader_unavailable')),
            ):
                type(self).mode=mode
                status,payload,_=self.request('POST',m.LAUNCH_RANKING_PATH,headers,body)
                self.assertEqual((status,json.loads(payload)),(expected[0],{'code':expected[1]}))


if __name__=='__main__':unittest.main()

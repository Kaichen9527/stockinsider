"""Internal staging-only fixed HTTP read boundary; never execution authority.

Fixed private-namespace loopback3302 -> loopback3301 only. Parent admission must
establish OS isolation and the independently restricted staging JWT/DB role.
Only the two exact Supabase snapshot-reader requests are permitted. No RPC,
write, arbitrary URL/port, client credential passthrough, redirect or logs.
"""
from contextlib import contextmanager
import http.client
import http.server
import time
import hmac
import json
import re
import socket
import threading
from urllib.parse import parse_qsl, urlencode

REQUEST_LINE_LIMIT=4096
HEADER_BYTES_LIMIT=8192
HEADER_COUNT_LIMIT=32
RESPONSE_BYTES_LIMIT=2*1024**2
SOCKET_SECONDS=3
UPSTREAM_WALL_SECONDS=8
REQUEST_WALL_SECONDS=12
SNAPSHOT_SELECT='id,etag,content_as_of,published_at,payload_json'
STATE_SELECT='status,last_attempt_at,terminal_reason'
METRICS=('requests','allowedReads','blockedRequests','upstreamFailures','responseBytes')


class FixedReadProxyRejected(Exception):
    def __init__(self):super().__init__('fixed_staging_read_proxy_rejected')


class _HeaderBudgetReader:
    def __init__(self,wrapped):self._wrapped,self._used,self.complete=wrapped,0,False
    def readline(self,size=-1):
        remaining=HEADER_BYTES_LIMIT-self._used
        limit=remaining+1 if size<0 else min(size,remaining+1)
        line=self._wrapped.readline(limit)
        if line in (b'\r\n',b'\n'):self.complete=True
        self._used+=len(line)
        if self._used>HEADER_BYTES_LIMIT:raise http.client.LineTooLong('fixed_header_budget')
        return line
    def __getattr__(self,name):return getattr(self._wrapped,name)


class _BoundedResponse(http.client.HTTPResponse):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs)
        self.fp=_HeaderBudgetReader(self.fp)


def _fixed_target(raw):
    if type(raw) is not str or len(raw)>REQUEST_LINE_LIMIT:return None
    path,separator,query=raw.partition('?')
    if path not in ('/rest/v1/radar_public_snapshots','/rest/v1/radar_publication_state') or not separator:
        return None
    try:
        pairs=parse_qsl(query,keep_blank_values=True,strict_parsing=True,max_num_fields=5,errors='strict')
    except (ValueError,UnicodeError):return None
    fields=dict(pairs)
    if len(fields)!=len(pairs):return None
    if path.endswith('radar_public_snapshots'):
        if set(fields)!={'select','window_key','status','order','limit'}:return None
        if fields['select']!=SNAPSHOT_SELECT or fields['status']!='eq.valid' or fields['order']!='published_at.desc' or fields['limit']!='1':return None
    else:
        if set(fields)!={'select','window_key'} or fields['select']!=STATE_SELECT:return None
    if fields['window_key'] not in ('eq.home','eq.daily'):return None
    # Rebuild from allowlisted values; never forward the request target verbatim.
    return path.removeprefix('/rest/v1')+'?'+urlencode(sorted(fields.items()))


class _Handle:
    def __init__(self):
        self._counts={key:0 for key in METRICS}
        self.closed=False
    @property
    def metrics(self):return dict(self._counts)


@contextmanager
def start_fixed_read_proxy(stage_jwt,detail_read=None):
    """Own/reap a fixed HTTP server thread; no listener or token in receipts.

    The token is an internal stage credential, not an admission flag. Caller
    credentials are ignored and can never change the upstream authorization.
    """
    if (type(stage_jwt) is not str or not 64<=len(stage_jwt)<=4096
            or not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',stage_jwt)):
        raise FixedReadProxyRejected()
    if detail_read is not None:
        from .t18_detail_read_adapter import _DetailRead
        if type(detail_read) is not _DetailRead:raise FixedReadProxyRejected()
    handle=_Handle();detail_started=[None];detail_requests=[0]

    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version='HTTP/1.1'
        def setup(self):
            self.request.settimeout(SOCKET_SECONDS)
            super().setup()
        def log_message(self,*_):pass
        def version_string(self):return 'FixedStagingReader'
        def _reply(self,status,body,content_type='application/json'):
            self.close_connection=True
            self.send_response(status)
            self.send_header('Connection','close')
            self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(body)))
            self.end_headers()
            if self.command!='HEAD':self.wfile.write(body)
        def _blocked(self,status=403):
            handle._counts['blockedRequests']+=1
            self._reply(status,b'{"error":"fixed_reader_request_rejected"}')
        def send_error(self,code,message=None,explain=None):self._blocked(code)
        def handle_expect_100(self):
            self._blocked(417)
            return False
        def handle_one_request(self):
            self.command=None;self.request_version='HTTP/1.1';self.requestline=''
            try:
                self.raw_requestline=self.rfile.readline(REQUEST_LINE_LIMIT+1)
                if not self.raw_requestline:self.close_connection=True;return
                handle._counts['requests']+=1
                if len(self.raw_requestline)>REQUEST_LINE_LIMIT:self._blocked(414);return
                pieces=self.raw_requestline.rstrip(b'\r\n').split()
                if len(pieces)!=3:self._blocked(400);return
                try:raw_target=pieces[1].decode('ascii')
                except UnicodeError:self._blocked(400);return
                self.rfile=_HeaderBudgetReader(self.rfile)
                if not self.parse_request():return
                if not self.rfile.complete or self.server.request_expired(self.request):self._blocked(400);return
                if self.path!=raw_target:self._blocked(400);return
                if self.command not in (('GET','HEAD','POST') if detail_read is not None else ('GET','HEAD')):self._blocked(405);return
                self._read()
                self.wfile.flush()
            except (TimeoutError,OSError,http.client.HTTPException):
                self.close_connection=True
            finally:self.close_connection=True
        def _detail_read(self):
            from .t18_detail_read_adapter import RPC_PATH
            detail_requests[0]+=1
            if detail_requests[0]>128:
                self._blocked(429);return
            auth=self.headers.get_all('Authorization',[])
            if self.command not in ('GET','POST') or len(auth)!=1 or not hmac.compare_digest(auth[0].encode('latin1'),('Bearer '+stage_jwt).encode('ascii')):
                self._blocked();return
            if (any(self.headers.get(x) is not None for x in ('Range','Range-Unit','Prefer','Forwarded','X-HTTP-Method-Override'))
                or self.headers.get_all('Accept-Profile',[]) not in ([],['public'])
                or self.headers.get_all('Content-Profile',[]) not in ([],['public'])):
                self._blocked();return
            accept=self.headers.get_all('Accept',['application/json'])
            if len(accept)!=1 or accept[0] not in ('application/json','application/vnd.pgrst.object+json','*/*'):
                self._blocked();return
            body=b''
            if self.command=='POST':
                lengths=self.headers.get_all('Content-Length',[])
                if (self.path!=RPC_PATH or len(lengths)!=1 or not lengths[0].isdecimal()
                    or not 1<=int(lengths[0])<=256 or self.headers.get_all('Content-Type',[])!=['application/json']):
                    self._blocked();return
                body=self.rfile.read(int(lengths[0]))
                if len(body)!=int(lengths[0]) or self.server.request_expired(self.request):self._blocked();return
            value=detail_read.response(self.command,self.path,body)
            if value is None:self._blocked();return
            if detail_started[0] is None:detail_started[0]=time.monotonic()
            if time.monotonic()-detail_started[0]>60:self._blocked(429);return
            if accept[0]=='application/vnd.pgrst.object+json' and type(value) is list:
                if len(value)!=1:self._blocked(406);return
                value=value[0]
            data=json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
            if len(data)>RESPONSE_BYTES_LIMIT:self._blocked();return
            handle._counts['allowedReads']+=1;handle._counts['responseBytes']+=len(data)
            self._reply(200,data)

        def _read(self):
            if self.server.request_expired(self.request):self._blocked(408);return
            if (len(self.headers)>HEADER_COUNT_LIMIT
                or self.headers.get_all('Host',[])!=['127.0.0.1:3302']
                or self.headers.get('Transfer-Encoding') is not None
                or self.headers.get('Upgrade') is not None
                or self.command!='POST' and self.headers.get_all('Content-Length',[]) not in ([],['0'])):
                self._blocked(400);return
            target=_fixed_target(self.path)
            if target is None and detail_read is not None:
                self._detail_read();return
            if target is None or self.command=='POST':self._blocked();return
            accept=self.headers.get('Accept','application/json')
            if accept not in ('application/json','application/vnd.pgrst.object+json','*/*'):
                self._blocked(400);return
            handle._counts['allowedReads']+=1
            connection=http.client.HTTPConnection('127.0.0.1',3301,timeout=SOCKET_SECONDS)
            connection.response_class=_BoundedResponse
            expired=threading.Event()
            transport=[None]
            def expire():
                expired.set()
                # getresponse() may clear connection.sock for Connection:close
                # while its response file still owns the live transport.
                active=transport[0] or connection.sock
                if active is not None:
                    try:active.shutdown(socket.SHUT_RDWR)
                    except OSError:pass
                connection.close()
            timer=threading.Timer(UPSTREAM_WALL_SECONDS,expire);timer.daemon=True;timer.start()
            try:
                connection.request(self.command,target,headers={'Host':'127.0.0.1:3301',
                  'Authorization':'Bearer '+stage_jwt,'Accept':accept,'Accept-Profile':'public',
                  'Accept-Encoding':'identity','Connection':'close'})
                transport[0]=connection.sock
                if expired.is_set():raise FixedReadProxyRejected()
                response=connection.getresponse()
                if (not 200<=response.status<=599 or 300<=response.status<400
                    or len(response.headers)>HEADER_COUNT_LIMIT
                    or response.getheader('Content-Encoding','identity')!='identity'):
                    raise FixedReadProxyRejected()
                length=response.getheader('Content-Length')
                if length is not None and (not length.isdecimal() or int(length)>RESPONSE_BYTES_LIMIT):
                    raise FixedReadProxyRejected()
                body=response.read(RESPONSE_BYTES_LIMIT+1)
                if len(body)>RESPONSE_BYTES_LIMIT or expired.is_set():raise FixedReadProxyRejected()
                content_type=response.getheader('Content-Type','application/json')
                if (len(content_type)>128 or content_type.split(';',1)[0].strip() not in ('application/json','application/problem+json','application/vnd.pgrst.object+json')
                    or any(not 32<=ord(c)<127 for c in content_type)):raise FixedReadProxyRejected()
                self._reply(response.status,body,content_type)
                handle._counts['responseBytes']+=len(body)
            except (OSError,http.client.HTTPException,FixedReadProxyRejected,ValueError):
                handle._counts['upstreamFailures']+=1
                self._reply(502,b'{"error":"fixed_reader_upstream_rejected"}')
            finally:
                timer.cancel();timer.join(timeout=1);connection.close()

    class Server(http.server.HTTPServer):
        allow_reuse_address=True
        def __init__(self,*args,**kwargs):
            self._active={};self._active_lock=threading.Lock();self._closing=False
            super().__init__(*args,**kwargs)
        @staticmethod
        def _shutdown_socket(connection):
            try:connection.shutdown(socket.SHUT_RDWR)
            except OSError:pass
        def get_request(self):
            connection,address=super().get_request()
            with self._active_lock:
                if self._closing:
                    connection.close()
                    raise OSError('fixed_proxy_closing')
                expired=threading.Event()
                def expire():
                    expired.set()
                    self._shutdown_socket(connection)
                timer=threading.Timer(REQUEST_WALL_SECONDS,expire)
                timer.daemon=True
                self._active[connection]=(timer,expired)
                timer.start()
            return connection,address
        def request_expired(self,request):
            with self._active_lock:entry=self._active.get(request)
            return entry is None or entry[1].is_set()
        def close_request(self,request):
            with self._active_lock:entry=self._active.pop(request,None)
            if entry:
                entry[0].cancel();entry[0].join(timeout=1)
            super().close_request(request)
        def shutdown_accepted(self):
            # Mark before closing: an accept racing context exit cannot become
            # a fresh blocking handler after the active-socket snapshot.
            with self._active_lock:
                self._closing=True
                active=list(self._active)
                for _,expired in self._active.values():expired.set()
            for connection in active:self._shutdown_socket(connection)
        def handle_error(self,request,client_address):pass

    server=None;thread=None
    try:
        server=Server(('127.0.0.1',3302),Handler)
        thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.05},daemon=False)
        thread.start()
        yield handle
    finally:
        if server:
            server.shutdown_accepted()
            if thread:server.shutdown()
            server.server_close()
        if thread:thread.join(timeout=2)
        handle.closed=thread is None or not thread.is_alive()
        if not handle.closed:raise FixedReadProxyRejected()

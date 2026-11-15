# Regression reproducer for the exact pinned product blob, supplied as base64 on stdin.
import base64,hashlib,json,os,socket,sys
from unittest.mock import patch
pin='3e2783f832093e0d724950b38003ad0894748c39'
source=base64.b64decode(sys.stdin.readline().strip(),validate=True)
assert hashlib.sha1(b'blob '+str(len(source)).encode()+b'\x00'+source).hexdigest()==pin
module={'__name__':'exact_candidate_financial_parser_socket', '__file__':'/isolated/candidate_financial_parser_socket.py'}
exec(compile(source,'exact_pinned_candidate_financial_parser_socket.py','exec'),module)
class TestListener:
    def __init__(self):
        self.first_server, self.first_client=socket.socketpair(socket.AF_UNIX,socket.SOCK_STREAM)
        self.second_server, self.second_client=socket.socketpair(socket.AF_UNIX,socket.SOCK_STREAM)
        self.accepted=0
        self.second_client.shutdown(socket.SHUT_WR)
        self.second_client.settimeout(.25)
    def accept(self):
        self.accepted+=1
        if self.accepted==1:return self.first_server, ''
        if self.accepted==2:return self.second_server, ''
        raise StopIteration
    def close(self):
        for endpoint in (self.first_server,self.first_client,self.second_server,self.second_client):
            endpoint.close()
def run(disconnect):
    probe=TestListener()
    if disconnect:
        probe.first_client.close()
    else:
        probe.first_client.shutdown(socket.SHUT_WR)
    try:
        with patch.object(socket,'fromfd',return_value=probe):
            try:
                module['main']()
            except (BrokenPipeError,StopIteration) as exc:
                failure=type(exc).__name__
        try:
            payload=probe.second_client.recv(1024)
        except TimeoutError:
            payload=b''
        return {'accepted':probe.accepted,'exit':failure,'secondReply':json.loads(payload) if payload else None}
    finally:
        probe.close()
control=run(False)
assert control=={'accepted':3,'exit':'StopIteration','secondReply':{'error':'parser_socket_header_invalid'}},control
disconnected=run(True)
assert disconnected=={'accepted':1,'exit':'BrokenPipeError','secondReply':None},disconnected
print(json.dumps({'positiveControl':control,'clientDisconnectedBeforeReply':disconnected,'exactBlob':pin,'actualUnixSocketPairs':True,'nonRoot':os.getuid()!=0,'productionSocketContacted':False}))

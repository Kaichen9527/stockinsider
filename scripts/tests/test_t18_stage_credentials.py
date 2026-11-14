"""Public bytes, actual kernel seals/SCM/UID refusals; no privileged admission."""
import array
import base64
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from deployment.staging.vnext.t17_keyfd import stage_credentials as m,t18_app_broker as b,t18_host_plan as p
from deployment.staging.vnext.t17_keyfd import t18_fd_handoff as handoff

ROOT=Path(__file__).resolve().parents[2]


def acl(uid,perms):
    return struct.pack('<I',2)+b''.join(struct.pack('<HHI',tag,value,identity) for tag,value,identity in (
        (1,perms,0xffffffff),(2,perms,uid),(4,0,0xffffffff),(16,perms,0xffffffff),(32,0,0xffffffff)))


class StageCredentialTests(unittest.TestCase):
    def test_exact_900second_token_old_issuance_and_minimum_remaining(self):
        with patch.object(m.time,'time',return_value=100000):secret,token=m.create_stage_jwt()
        try:
            for elapsed in (0,30,350,600):
                with patch.object(m.time,'time',return_value=100000+elapsed):self.assertEqual(m.validate_stage_token(secret,token),100900)
            for elapsed in (601,899,900):
                with patch.object(m.time,'time',return_value=100000+elapsed):
                    with self.assertRaises(m.StageCredentialRejected):m.validate_stage_token(secret,token)
            with patch.object(m.time,'time',return_value=100899):m.validate_stage_token(secret,token,minimum_remaining=0)
            with patch.object(m.time,'time',return_value=100900):
                with self.assertRaises(m.StageCredentialRejected):m.validate_stage_token(secret,token,minimum_remaining=0)
            for other in (b'P'*32,b'SHORT'):
                with self.assertRaises(m.StageCredentialRejected):m.validate_stage_token(other,token)
            with self.assertRaises(m.StageCredentialRejected):m.validate_stage_token(secret,token,minimum_remaining=False)
            header=m._b64(b'{"alg":"HS256","typ":"JWT"}')
            claim=m._b64(b'{"role":"service_role","role":"t18_reader","aud":"stockinsider-t18","iat":100000,"exp":100900}')
            signed=(header+'.'+claim).encode()
            duplicate=signed.decode()+'.'+m._b64(hmac.new(secret,signed,hashlib.sha256).digest())
            with patch.object(m.time,'time',return_value=100000):
                with self.assertRaises(m.StageCredentialRejected):m.validate_stage_token(secret,duplicate)
        finally:secret[:]=bytes(32)

    def test_material_roundtrip_tamper_truncate_and_overbound_reject(self):
        secret,token=m.create_stage_jwt()
        try:
            raw=m._encode(secret,token);owned,received=m._decode(raw)
            self.assertEqual(owned,secret);self.assertEqual(received,token);owned[:]=bytes(32)
            for value in (b'',raw[:-1],raw+b'X',b'X'+raw[1:],raw[:5]+bytes(32)+raw[37:],b'X'*(m.MAX_MATERIAL+1)):
                with self.assertRaises(m.StageCredentialRejected):m._decode(value)
        finally:secret[:]=bytes(32)

    def test_actual_kernel_seals_and_nonroot_fd_cannot_claim_root_authority(self):
        secret,token=m.create_stage_jwt();fd=None;prior=None
        try:
            fd=m._seal_public_or_stage_bytes(m._encode(secret,token))
            self.assertEqual(fcntl.fcntl(fd,m.F_GET_SEALS)&m.REQUIRED_SEALS,m.REQUIRED_SEALS)
            self.assertEqual(fcntl.fcntl(fd,fcntl.F_GETFL)&os.O_ACCMODE,os.O_RDONLY)
            with self.assertRaises(OSError):os.pwrite(fd,b'X',0)
            os.fchmod(fd,0o600)  # Public owner may change metadata, not sealed bytes.
            writable=os.open('/proc/self/fd/'+str(fd),os.O_RDWR)
            try:
                with self.assertRaises(OSError):os.pwrite(writable,b'X',0)
            finally:os.close(writable);os.fchmod(fd,0o400)
            # Internal selector patch reaches the actual owned unprivileged inode;
            # root UID check still rejects it. This is never a live acceptance.
            with patch.object(m,'FD',fd):
                with self.assertRaises(m.StageCredentialRejected):m.read_stage_credentials()
            with self.assertRaises(m.StageCredentialRejected):m.create_root_material()
        finally:
            secret[:]=bytes(32)
            if fd is not None:os.close(fd)

    def test_actual_backup_six_then_stage_packet_collision_safe_child_mapping(self):
        code=r'''
import fcntl,json,os,socket,sys
sys.path.insert(0,sys.argv[1])
from deployment.staging.vnext.t17_keyfd import t18_fd_handoff as h,stage_credentials as m
originals=[]
for i in range(7):
 f=os.memfd_create('PUBLIC_FD_MARKER',os.MFD_CLOEXEC);os.write(f,('PUBLIC_'+str(i)).encode());originals.append(fcntl.fcntl(f,fcntl.F_DUPFD_CLOEXEC,60));os.close(f)
a,b=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
aa=fcntl.fcntl(a.fileno(),fcntl.F_DUPFD_CLOEXEC,80);bb=fcntl.fcntl(b.fileno(),fcntl.F_DUPFD_CLOEXEC,80)
a.close();b.close();a=socket.socket(fileno=aa);b=socket.socket(fileno=bb)
occupied=os.open('/dev/null',os.O_RDONLY);assert occupied==3
h.send_six_fds(a,originals[:6]);m.send_stage_fd(a,originals[6])
received=h.receive_six_fds(b);stage=m.receive_stage_fd(b)
assert 9 in received
assert stage>=30 and fcntl.fcntl(stage,fcntl.F_GETFD)&fcntl.FD_CLOEXEC
h.install_fixed_fds(received);os.dup2(stage,9,inheritable=True);os.close(stage)
assert [os.pread(f,32,0) for f in range(3,10)]==[('PUBLIC_'+str(i)).encode() for i in range(7)]
assert all(os.get_inheritable(f) for f in range(3,10))
for f in range(3,10):os.close(f)
print('PUBLIC_SIX_PLUS_STAGE_MAPPING_VERIFIED')
'''
        out=subprocess.run([sys.executable,'-I','-B','-c',code,str(ROOT)],capture_output=True,timeout=5)
        self.assertEqual(out.returncode,0,out.stderr.decode());self.assertEqual(out.stdout,b'PUBLIC_SIX_PLUS_STAGE_MAPPING_VERIFIED\n')

    def test_actual_malformed_stage_rights_close_all_received_fds(self):
        for payload,count in ((b'X',1),(b'TTT',1),(b'T',0),(b'T',2)):
            left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
            originals=[os.memfd_create('PUBLIC_STAGE_MARKER',os.MFD_CLOEXEC) for _ in range(2)]
            try:
                baseline=len(os.listdir('/proc/self/fd'))
                rights=[] if not count else [(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',originals[:count]))]
                left.sendmsg([payload],rights)
                with self.assertRaises(m.StageCredentialRejected):m.receive_stage_fd(right)
                self.assertEqual(len(os.listdir('/proc/self/fd')),baseline)
            finally:
                left.close();right.close()
                for fd in originals:os.close(fd)

    def test_actual_loadcredential_server_refuses_nonroot_peer_without_payload(self):
        with tempfile.TemporaryDirectory(prefix='public-loader-',dir='/tmp') as root:
            path=str(Path(root)/'public.sock');listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
            listener.bind(path);listener.listen(1);listener.settimeout(2)
            client=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);client.connect(path)
            try:
                with self.assertRaises(m.StageCredentialRejected):m.serve_credential_once(listener,b'PUBLIC_FIXTURE_NOT_A_TOKEN')
                self.assertEqual(client.recv(64),b'')
            finally:client.close();listener.close()

    def test_named_acl_shape_rejects_other_user_group_writes_mask_or_version(self):
        for perms in (4,5):
            valid=acl(os.getuid(),perms);b._credential_acl(valid,os.getuid(),perms)
            for value in (valid[:-1],valid[:4]+valid[4:12]+valid[4:],struct.pack('<I',3)+valid[4:],
                acl(os.getuid()+1,perms),valid+struct.pack('<HHI',2,perms,os.getuid()+1),
                valid+struct.pack('<HHI',8,perms,99999),acl(os.getuid(),7),
                valid[:20]+struct.pack('<HHI',4,perms,0xffffffff)+valid[28:]):
                with self.assertRaises(b.AppBrokerRejected):b._credential_acl(value,os.getuid(),perms)

    def test_native_managed_token_exact_match_uses_public_file_no_write_or_unlink(self):
        with tempfile.TemporaryDirectory(prefix='public-managed-',dir='/tmp') as root:
            target=Path(root)/m.APP_CREDENTIAL_NAME;target.write_bytes(b'PUBLIC_FIXTURE_TOKEN');target.chmod(0o440)
            before=target.stat().st_ino
            with patch.object(b,'CREDENTIALS',root):
                b._managed_token_matches('PUBLIC_FIXTURE_TOKEN')
                with self.assertRaises(b.AppBrokerRejected):b._managed_token_matches('PUBLIC_DIFFERENT_TOKEN')
            self.assertEqual(target.stat().st_ino,before);self.assertEqual(target.read_bytes(),b'PUBLIC_FIXTURE_TOKEN')

    def test_fixed_unit_native_reader_and_unrelated_uid_denial_contract(self):
        self.assertEqual(m.APP_CREDENTIALS,'/run/credentials/'+p.APP_UNIT)
        def props(kind):return dict(x[11:].split('=',1) for x in p.build_unit_argv(kind,'real') if x.startswith('--property='))
        app=props('APP')
        self.assertEqual(app['LoadCredential'],m.APP_CREDENTIAL_NAME+':'+m.LOADER_SOCKET)
        self.assertNotIn(m.APP_CREDENTIALS,app['ReadWritePaths'])
        self.assertNotIn('/run/t18-app-credentials',str(p.build_unit_argv('APP','real')))
        for kind in ('DB','REST'):self.assertIn(m.APP_CREDENTIALS,props(kind)['InaccessiblePaths'])
        self.assertEqual(p.build_unit_argv('APP','invalid'),p.build_unit_argv('APP','real'))


if __name__=='__main__':unittest.main()

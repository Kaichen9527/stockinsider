"""Actual SCM_RIGHTS with public marker FDs only; no runtime/key admission."""
import array
import fcntl
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import unittest
from deployment.staging.vnext.t17_keyfd import t18_fd_handoff as m


def markers(count=6):
    result=[]
    for index in range(count):
        fd=os.memfd_create('public-handoff-marker',os.MFD_CLOEXEC)
        os.write(fd,('PUBLIC_MARKER_'+str(index)).encode());os.lseek(fd,0,os.SEEK_SET)
        result.append(fd)
    return result


def fd_count():return len(os.listdir('/proc/self/fd'))


class FdHandoffTests(unittest.TestCase):
    def test_actual_seqpacket_six_rights_roundtrip_cloexec_and_sender_retains_ownership(self):
        originals=markers();received=[]
        left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
        try:
            baseline=fd_count();m.send_six_fds(left,originals);received=m.receive_six_fds(right)
            self.assertEqual(len(set(received)),6);self.assertEqual(fd_count(),baseline+6)
            for index,fd in enumerate(received):
                self.assertTrue(fcntl.fcntl(fd,fcntl.F_GETFD)&fcntl.FD_CLOEXEC)
                self.assertEqual(os.pread(fd,64,0),('PUBLIC_MARKER_'+str(index)).encode())
                self.assertEqual(os.pread(originals[index],64,0),('PUBLIC_MARKER_'+str(index)).encode())
            m._close(received);received=[];self.assertEqual(fd_count(),baseline)
        finally:m._close(received);m._close(originals);left.close();right.close()

    def test_actual_rejected_records_close_every_delivered_fd(self):
        cases=((b'X',6),(b'VVV',6),(b'V',5),(b'V',7),(b'V',0))
        for payload,count in cases:
            with self.subTest(payload=payload,count=count):
                originals=markers(max(count,1));left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
                try:
                    baseline=fd_count()
                    ancillary=[] if count==0 else [(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',originals[:count]))]
                    left.sendmsg([payload],ancillary)
                    with self.assertRaises(m.FdHandoffRejected):m.receive_six_fds(right)
                    self.assertEqual(fd_count(),baseline)
                    self.assertEqual(os.pread(originals[0],64,0),b'PUBLIC_MARKER_0')
                finally:m._close(originals);left.close();right.close()

    def test_parser_rejects_extra_or_wrong_ancillary_without_fd_leak(self):
        # Kernel does not permit fabricated control levels. Exercise the strict
        # parser with owned public descriptors, never claim runtime acceptance.
        for mode in ('extra','wrong','unaligned','not_cloexec'):
            originals=markers();baseline=fd_count()-6
            try:
                data=array.array('i',originals).tobytes()
                ancillary=[(socket.SOL_SOCKET,socket.SCM_RIGHTS,data)]
                if mode=='extra':ancillary.append((socket.SOL_SOCKET,65535,b''))
                elif mode=='wrong':ancillary.insert(0,(65535,65535,b''))
                elif mode=='unaligned':ancillary[0]=(socket.SOL_SOCKET,socket.SCM_RIGHTS,data+b'x')
                else:os.set_inheritable(originals[0],True)
                with self.assertRaises(m.FdHandoffRejected):m._received_fds(b'V',ancillary,0)
                self.assertEqual(fd_count(),baseline)
            finally:m._close(originals)

    def test_sender_rejects_duplicate_invalid_or_stream_without_transferring(self):
        originals=markers();left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
        try:
            for value in (originals[:5],[originals[0]]*6,[*originals[:5],True],[*originals[:5],-1]):
                with self.assertRaises(m.FdHandoffRejected):m.send_six_fds(left,value)
            stream_left,stream_right=socket.socketpair()
            try:
                with self.assertRaises(m.FdHandoffRejected):m.send_six_fds(stream_left,originals)
            finally:stream_left.close();stream_right.close()
            for fd in originals:os.fstat(fd)
        finally:m._close(originals);left.close();right.close()

    def test_actual_subprocess_collision_safe_mapping_all_targets_and_extras_close(self):
        root=Path(__file__).resolve().parents[2]
        program=r'''
import json,os,fcntl
from deployment.staging.vnext.t17_keyfd.t18_fd_handoff import install_fixed_fds
opened=[]
for i in range(6):
 fd=os.memfd_create('public-marker',os.MFD_CLOEXEC)
 os.write(fd,('PUBLIC_MARKER_'+str(i)).encode());opened.append(fd)
safe=[fcntl.fcntl(fd,fcntl.F_DUPFD_CLOEXEC,20) for fd in opened]
for fd in opened:os.close(fd)
for target,source in zip(range(3,9),safe):os.dup2(source,target,inheritable=False)
for fd in safe:os.close(fd)
# Reverse to ensure every original collides with a different target slot.
result=install_fixed_fds([8,7,6,5,4,3])
assert result==(3,4,5,6,7,8)
assert all(os.get_inheritable(fd) for fd in result)
assert [os.pread(fd,64,0).decode() for fd in result]==['PUBLIC_MARKER_'+str(i) for i in reversed(range(6))]
assert not [int(x) for x in os.listdir('/proc/self/fd') if int(x)>=20]
for fd in result:os.close(fd)
print(json.dumps({'mapped':6,'collisionSafe':True,'safeCopiesClosed':True}))
'''
        result=subprocess.run([sys.executable,'-B','-c',program],cwd=root,
            env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},capture_output=True,timeout=5)
        self.assertEqual(result.returncode,0,result.stderr.decode())
        self.assertEqual(json.loads(result.stdout),{'mapped':6,'collisionSafe':True,'safeCopiesClosed':True})

    def test_fixed_bootstrap_actual_cloud_refuses_without_runtime_or_arguments(self):
        root=Path(__file__).resolve().parents[2]
        script=root/'scripts/staging_t18_fd_bootstrap.py'
        for args in ([],['--command','PUBLIC_FORBIDDEN'],['--admission-only']):
            result=subprocess.run([sys.executable,'-I','-B',str(script),*args],cwd=root,
                env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},capture_output=True,timeout=5)
            self.assertEqual(result.returncode,2);self.assertEqual(result.stdout,b'');self.assertEqual(result.stderr,b'')
        self.assertEqual(m.FIXED_EXEC,('/usr/bin/python3','-I','-B',
            '/readonly/t18-source/scripts/staging_restore_next_rollback.py','--work-root','/run/t18-db-work'))


if __name__=='__main__':unittest.main()

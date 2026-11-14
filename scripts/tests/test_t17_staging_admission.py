"""Pure parser/limit tests plus actual Cloud rejection, no mocked live grant."""
import os
import fcntl
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from deployment.staging.vnext.t17_keyfd import staging_admission as m

HEADER=(b'Inter-|   Receive                                                |  Transmit\n'
        b' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n')


def public_devices(*names):
    return HEADER+b''.join(name.encode()+b': '+b' '.join([b'0']*16)+b'\n' for name in names)


class StagingAdmissionTests(unittest.TestCase):
    def test_proc_interface_parser_accepts_kernel_columns_not_admission(self):
        self.assertEqual(m._parse_proc_net_dev(public_devices('lo')),{'lo'})
        self.assertEqual(m._parse_proc_net_dev(public_devices('lo','veth0')),{'lo','veth0'})
        counters=public_devices('lo').replace(b'0',str(2**64-1).encode())
        self.assertEqual(m._parse_proc_net_dev(counters),{'lo'})
        with self.assertRaises(TypeError):m._observe_network_interfaces('/tmp/caller_override')

    def test_proc_interface_parser_rejects_malformed_truncated_duplicate_or_unknown(self):
        valid=public_devices('lo')
        invalid=[b'',b'caller_verified=true\n',HEADER,valid[:-1],valid+b'\n',
          valid.replace(b'Receive',b'Unknown'),valid.replace(b'frame compressed',b'compressed frame'),
          valid.replace(b'lo:',b'lo::'),valid.replace(b'lo:',b'../lo:'),valid.replace(b'lo:',b'l o:'),
          public_devices('lo','lo'),public_devices('x'*16),valid.replace(b'0 0',b'0',1),
          valid.replace(b'0 0',b'0 0 0',1),valid.replace(b'0',b'-1',1),valid.replace(b'0',b'+1',1),
          valid.replace(b'0',b'1.0',1),valid.replace(b'0',str(2**64).encode(),1),
          valid.replace(b'0',b'\xff',1),valid.replace(b'\n',b'\r\n'),valid.replace(b'0',b'\x0b0',1)]
        for data in invalid:
            with self.subTest(case=invalid.index(data)):
                with self.assertRaisesRegex(m.StagingAdmissionRejected,'^network_interface_observation_invalid$'):
                    m._parse_proc_net_dev(data)
        for data in ('lo',True,{'lo':True},None):
            with self.assertRaises(m.StagingAdmissionRejected):m._parse_proc_net_dev(data)

    def test_proc_interface_parser_bounds_bytes_and_rows(self):
        self.assertEqual(len(m._parse_proc_net_dev(public_devices(*(f'v{i}' for i in range(64))))),64)
        for data in (public_devices(*(f'v{i}' for i in range(65))),public_devices('lo')+b' '*16384):
            with self.assertRaises(m.StagingAdmissionRejected):m._parse_proc_net_dev(data)

    def test_actual_current_kernel_interface_observation_matches_existing_api(self):
        # Current Cloud has other interfaces and is still NOT admitted.
        self.assertEqual(m._observe_network_interfaces(),{name for _,name in socket.if_nameindex()})

    def test_actual_kernel_netlink_denial_does_not_block_fixed_proc_observer(self):
        # Tighten only this owned child with the kernel seccomp errno97 rule.
        # This proves transport compatibility, never a private namespace grant.
        root=Path(__file__).resolve().parents[2]
        code=r'''
import ctypes,ctypes.util,errno,socket,sys
sys.path.insert(0,sys.argv[1])
from deployment.staging.vnext.t17_keyfd import staging_admission as m
expected={name for _,name in socket.if_nameindex()}
library=ctypes.util.find_library('seccomp')
assert library,'seccomp_library_required_for_kernel_regression'
s=ctypes.CDLL(library,use_errno=True)
class Compare(ctypes.Structure):
 _fields_=[('arg',ctypes.c_uint),('op',ctypes.c_uint),('a',ctypes.c_uint64),('b',ctypes.c_uint64)]
s.seccomp_init.argtypes=[ctypes.c_uint32];s.seccomp_init.restype=ctypes.c_void_p
s.seccomp_syscall_resolve_name.argtypes=[ctypes.c_char_p];s.seccomp_syscall_resolve_name.restype=ctypes.c_int
s.seccomp_rule_add_array.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_int,ctypes.c_uint,ctypes.POINTER(Compare)]
s.seccomp_load.argtypes=[ctypes.c_void_p];s.seccomp_release.argtypes=[ctypes.c_void_p]
context=s.seccomp_init(0x7fff0000)
assert context
try:
 number=s.seccomp_syscall_resolve_name(b'socket');assert number>=0
 rule=Compare(0,4,socket.AF_NETLINK,0)
 assert s.seccomp_rule_add_array(context,0x00050000|errno.EAFNOSUPPORT,number,1,ctypes.byref(rule))==0
 assert s.seccomp_load(context)==0
finally:s.seccomp_release(context)
try:socket.if_nameindex()
except OSError as error:assert error.errno==errno.EAFNOSUPPORT
else:raise AssertionError('kernel_netlink_denial_not_observed')
assert m._observe_network_interfaces()==expected
try:m._namespace_and_privileges()
except m.StagingAdmissionRejected:pass
else:raise AssertionError('cloud_was_not_expected_to_gain_admission')
print('NETLINK_DENIED_PROC_OBSERVED_NO_ADMISSION')
'''
        result=subprocess.run([sys.executable,'-I','-B','-c',code,str(root)],capture_output=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr.decode())
        self.assertEqual(result.stdout,b'NETLINK_DENIED_PROC_OBSERVED_NO_ADMISSION\n')

    def test_actual_cloud_environment_is_not_silently_admitted(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(m.StagingAdmissionRejected):
                m.observe_staging(directory)

    def test_limits_reject_unbounded_or_oversize_memory(self):
        self.assertEqual(m._finite_memory_limit(str(768*1024**2)),768*1024**2)
        for value in ('max','0','-1',str(768*1024**2+1),'unknown'):
            with self.assertRaises(m.StagingAdmissionRejected):m._finite_memory_limit(value)

    def test_mount_parser_preserves_real_binding_and_private_propagation(self):
        rows=m._mounts('20 1 253:2 / /run/stage rw,nosuid,nodev - ext4 /dev/dm-2 rw\n')
        self.assertEqual(rows[0]['device'],'253:2')
        self.assertEqual(rows[0]['mount'],'/run/stage')
        self.assertEqual(rows[0]['filesystem'],'ext4')
        self.assertEqual(rows[0]['optional'],[])
        self.assertEqual(m._decode_mount_field('/run/a\\040b'),'/run/a b')
        with self.assertRaises(m.StagingAdmissionRejected):m._mounts('caller_verified=true')

    def test_no_receipt_or_readiness_override(self):
        with self.assertRaises(TypeError):m.observe_staging('/tmp',ready=True)
        with self.assertRaises(TypeError):m.observe_staging('/tmp',receipt={'passed':True})

    def test_nonroot_lock_cannot_be_used_as_host_authority(self):
        with tempfile.TemporaryFile() as f:
            if os.getuid()!=0:
                with self.assertRaisesRegex(m.StagingAdmissionRejected,'root_owned_host_lock_required'):
                    m._observe_exclusive_lock(f.fileno())

    def test_actual_flock_exclusion_with_independent_open_description(self):
        # Syscall proof only: this user-owned fixture is NOT a host admission FD.
        with tempfile.TemporaryFile() as f:
            m._acquire_exclusive_lock(f.fileno())
            independent=os.open('/proc/self/fd/'+str(f.fileno()),os.O_RDONLY)
            try:
                with self.assertRaisesRegex(m.StagingAdmissionRejected,'exclusive_host_lock_unavailable'):
                    m._acquire_exclusive_lock(independent)
                fcntl.flock(f.fileno(),fcntl.LOCK_UN)
                m._acquire_exclusive_lock(independent)
            finally:os.close(independent)

    def test_actual_sparse_and_preallocated_image_accounting(self):
        # Only64KiB public storage; no mock positive system admission.
        with tempfile.TemporaryFile() as f:
            os.ftruncate(f.fileno(),65536)
            with self.assertRaisesRegex(m.StagingAdmissionRejected,'fully_preallocated'):
                m._check_preallocation(os.fstat(f.fileno()),65536)
            os.posix_fallocate(f.fileno(),0,65536)
            m._check_preallocation(os.fstat(f.fileno()),65536)
            with self.assertRaisesRegex(m.StagingAdmissionRejected,'filesystem_image_size'):
                m._check_preallocation(os.fstat(f.fileno()),65537)


if __name__=='__main__':unittest.main()

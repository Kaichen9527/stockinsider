"""Pure parser/limit tests plus actual Cloud rejection, no mocked live grant."""
import os
import fcntl
from pathlib import Path
import tempfile
import unittest
from deployment.staging.vnext.t17_keyfd import staging_admission as m


class StagingAdmissionTests(unittest.TestCase):
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

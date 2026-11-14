"""Host source-only boundaries; Cloud NEVER provisions users/mounts/units."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'scripts/staging_t18_host.py'
spec=importlib.util.spec_from_file_location('public_t18_host_source',SOURCE)
host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)


class HostLauncherTests(unittest.TestCase):
    def test_actual_cloud_refuses_before_any_host_action_or_key(self):
        for args in (['admission'],['invalid','--manifest-sha256','0'*64],['real','--manifest-sha256','0'*64]):
            result=subprocess.run([sys.executable,'-I','-B',str(SOURCE),*args],
                input=b'PUBLIC_FIXTURE_NOT_A_KEY',env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},capture_output=True,timeout=10)
            self.assertEqual(result.returncode,2);self.assertEqual(result.stderr,b'')
            observed=json.loads(result.stdout)
            self.assertEqual(observed['status'],'REJECTED');self.assertEqual(observed['reason'],'root_host_only')
            self.assertNotIn(b'PUBLIC_FIXTURE',result.stdout)
        with patch.object(host,'command',side_effect=AssertionError('host_action_must_not_run')):
            with self.assertRaisesRegex(host.HostRejected,'^root_host_only$'):host.execute('admission',None)

    def test_argument_rejection_does_not_echo_values(self):
        for args in (['PUBLIC_DO_NOT_ECHO'],['real','--manifest-sha256','PUBLIC_DO_NOT_ECHO'],
            ['admission','--command','PUBLIC_DO_NOT_ECHO'],['admission','--manifest-sha256','0'*64]):
            result=subprocess.run([sys.executable,'-I','-B',str(SOURCE),*args],capture_output=True,timeout=5)
            self.assertEqual(result.returncode,2);self.assertNotIn(b'PUBLIC_DO_NOT_ECHO',result.stdout+result.stderr)

    def test_stdin_helper_exact32_eof_rejects_short_or_long(self):
        # Tests only this private byte transport, not root authority or realkey.
        code="import importlib.util,sys;sys.path.insert(0,"+repr(str(ROOT))+");s=importlib.util.spec_from_file_location('h',"+repr(str(SOURCE))+");m=importlib.util.module_from_spec(s);s.loader.exec_module(m);v=m._read_stdin_key();print(len(v));v[:]=bytes(len(v))"
        for length in (0,31,32,33,64):
            result=subprocess.run([sys.executable,'-I','-B','-c',code],input=b'P'*length,
                stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=6)
            self.assertEqual(result.returncode==0,length==32)
            if length==32:self.assertEqual(result.stdout,b'33\n')
            else:self.assertEqual(result.stdout,b'')

    def test_three_unit_admission_actual_cloud_refuses_without_key(self):
        result=subprocess.run([sys.executable,'-I','-B',str(ROOT/'scripts/staging_t18_host_admission.py')],
            input=b'PUBLIC_UNUSED_STDIN',capture_output=True,timeout=10)
        self.assertEqual(result.returncode,2);self.assertEqual(result.stderr,b'')
        data=json.loads(result.stdout);self.assertEqual(data['status'],'REJECTED')
        for field in ('keyRead','databaseStarted','applicationStarted','runtimeRestoreAdmission'):
            self.assertIs(data[field],False)

    def test_actual_large_child_output_is_drained_without_pipe_deadlock(self):
        child=subprocess.Popen([sys.executable,'-I','-B','-c',
            "import sys;sys.stdout.buffer.write(b'P'*(768*1024));sys.stderr.buffer.write(b'E'*(128*1024))"],
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
        capture=host._Capture(child)
        self.assertEqual(child.wait(timeout=5),0)
        out,err=capture.finish()
        self.assertEqual((len(out),len(err)),(768*1024,128*1024))
        self.assertFalse(any(thread.is_alive() for thread in capture.threads))
        child=subprocess.Popen([sys.executable,'-I','-B','-c',"import sys;sys.stdout.buffer.write(b'P'*(2*1024**2))"],
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
        capture=host._Capture(child);self.assertEqual(child.wait(timeout=5),0)
        with self.assertRaisesRegex(host.HostRejected,'^host_capture_limit_or_incomplete$'):capture.finish()
        self.assertLessEqual(len(capture.buffers[0]),1024**2)
        self.assertFalse(any(thread.is_alive() for thread in capture.threads))

    def test_real_gap_is_nonacceptance_and_schema_code_pairs_are_exact(self):
        schema='stockinsider-staging-next-rollback-v1'
        gap={'schema':schema,'status':'DB_VERIFIED_T18_GAP'}
        self.assertEqual(host._runner_outcome('real',3,gap),3)
        for code in (0,2):
            with self.assertRaises(host.HostRejected):host._runner_outcome('real',code,gap)
        with self.assertRaises(host.HostRejected):host._runner_outcome('real',0,{'status':'DB_VERIFIED_FIXED_T18_EXERCISED'})
        with self.assertRaises(host.HostRejected):host._runner_outcome('admission',0,{'schema':schema,'status':'HOST_PREREQUISITES_VERIFIED_ONLY'})

    def test_unknown_baseline_or_no_attach_intent_never_detaches_retained_loop(self):
        with patch.object(host,'_loops_for',side_effect=AssertionError('must_not_inventory_or_detach')):
            self.assertEqual(host._owned_loops('/PUBLIC_NOT_REAL_IMAGE',set(),False),set())
        with patch.object(host,'_loops_for',return_value={'/dev/loop7','/dev/loop9'}):
            self.assertEqual(host._owned_loops('/PUBLIC_NOT_REAL_IMAGE',{'/dev/loop7'},True),{'/dev/loop9'})

    def test_fixed_service_and_intake_contracts_have_no_selectors(self):
        self.assertEqual(host.SERVICES,('stockinsider-web-standalone.service','stockinsider-internal-worker.service',
            'stockinsider-postgrest.service','postgresql@17-stockinsider.service'))
        self.assertEqual(host.CIPHER_BYTES,491423538)
        self.assertEqual(str(host.HOSTLOCK),'/run/stockinsider-t17-5b65286/restore-host.lock')
        self.assertEqual(host.USERS,('si-t18-db','si-t18-app','si-t18-rest'))
        self.assertEqual(len(host.DIRS),8)
        self.assertTrue(all(path.startswith('/run/') for path in host.DIRS))


if __name__=='__main__':unittest.main()

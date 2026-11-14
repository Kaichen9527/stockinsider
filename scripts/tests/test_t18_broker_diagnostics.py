"""Public negative-component fixtures and real pipes, never runtime admission."""
from contextlib import ExitStack,contextmanager
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from deployment.staging.vnext.t17_keyfd import t18_app_broker as b,t18_host_plan as d
from deployment.staging.vnext.t17_keyfd.staging_admission import StagingAdmissionRejected

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('diagnostic_host_source',ROOT/'scripts/staging_t18_host.py')
host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)


class BrokerDiagnosticTests(unittest.TestCase):
    def test_success_and_cleanup_do_not_become_refusals_and_wrapper_lag_is_observed(self):
        child=subprocess.Popen([sys.executable,'-I','-B','-c','pass'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
        capture=host._Capture(child,512);self.assertEqual(child.wait(timeout=5),0)
        self.assertEqual(host._snapshot_broker_diagnostics({'APP':child},{'APP':capture}),(set(),{}))
        capture.finish()
        code="import sys,time;sys.path.insert(0,sys.argv[1]);from deployment.staging.vnext.t17_keyfd.t18_host_plan import broker_refusal_bytes;sys.stdout.buffer.write(broker_refusal_bytes('REST','node_version'));sys.stdout.flush();time.sleep(10)"
        child=subprocess.Popen([sys.executable,'-I','-B','-c',code,str(ROOT)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
        capture=host._Capture(child,512)
        try:
            deadline=time.monotonic()+5
            while not capture.buffers[0] and time.monotonic()<deadline:time.sleep(.01)
            failed,records=host._snapshot_broker_diagnostics({'REST':child},{'REST':capture})
            self.assertEqual(failed,set());self.assertEqual(records['REST']['tag'],'node_version')
            self.assertIsNone(child.poll())
        finally:child.terminate();child.wait(timeout=5);capture.finish()

    def test_socket_and_asset_entry_failure_phases_close_listener(self):
        for tag in ('control_path','control_socket_create','control_socket_bind','control_socket_listen','asset_verification'):
            with self.subTest(tag=tag),ExitStack() as stack:
                stack.enter_context(patch.object(b,'_observe_app_runtime',return_value=None))
                present=stack.enter_context(patch.object(b.os.path,'lexists',return_value=tag=='control_path'))
                listener=__import__('unittest.mock',fromlist=['MagicMock']).MagicMock()
                factory=stack.enter_context(patch.object(b.socket,'socket',return_value=listener))
                @contextmanager
                def rejected_assets():raise OSError('PUBLIC_DO_NOT_EXPORT');yield
                stack.enter_context(patch.object(b,'observe_fixed_release_assets',side_effect=rejected_assets))
                if tag=='control_socket_create':factory.side_effect=OSError('PUBLIC_DO_NOT_EXPORT')
                elif tag=='control_socket_bind':listener.bind.side_effect=OSError('PUBLIC_DO_NOT_EXPORT')
                elif tag=='control_socket_listen':listener.listen.side_effect=OSError('PUBLIC_DO_NOT_EXPORT')
                with self.assertRaises(b._StartupRejected) as caught:b._serve_fixed_broker(b.APP_USER)
                self.assertEqual(caught.exception.tag,tag)
                if tag not in ('control_path','control_socket_create'):listener.close.assert_called_once()

    def test_only_compiled_tags_and_roles_roundtrip(self):
        for role in ('APP','REST'):
            for tag in d.BROKER_REFUSAL_TAGS:
                data=d.broker_refusal_bytes(role,tag)
                self.assertLessEqual(len(data),d.BROKER_REFUSAL_MAX_BYTES)
                self.assertEqual(d.project_broker_refusal(data,role),{'schema':d.BROKER_REFUSAL_SCHEMA,'role':role,'tag':tag})
        for role,tag in (('ROOT','node_version'),('APP','PUBLIC_DO_NOT_EXPORT'),('APP',True)):
            with self.assertRaises(ValueError):d.broker_refusal_bytes(role,tag)

    def test_projection_rejects_raw_extra_duplicate_wrong_role_and_oversize(self):
        valid=d.broker_refusal_bytes('APP','node_version')
        invalid=[b'',b'PUBLIC_DO_NOT_EXPORT',valid+valid,valid+b'PUBLIC_DO_NOT_EXPORT',
          valid.replace(b'"tag":',b'"private":"PUBLIC_DO_NOT_EXPORT","tag":'),
          valid.replace(b'"tag":',b'"tag":"node_version","tag":'),
          valid.replace(b'node_version',b'PUBLIC_DO_NOT_EXPORT'),valid.replace(b'"APP"',b'"REST"'),
          valid.replace(b'node_version',b'\xff'),valid+b' '*512,b'{"schema":NaN}',b'[]',b'true',
          b'['*512,b'{"schema":"'+b'X'*512+b'"}']
        for data in invalid:self.assertIsNone(d.project_broker_refusal(data,'APP'))
        for data in (None,True,{'tag':'node_version'}):self.assertIsNone(d.project_broker_refusal(data,'APP'))
        self.assertIsNone(d.project_broker_refusal(valid,'ROOT'))

    def test_unknown_exception_is_never_serialized_or_treated_as_inner_tag(self):
        for tag in d.BROKER_REFUSAL_TAGS:
            with self.assertRaises(b._StartupRejected) as caught:
                with b._startup_check(tag):raise RuntimeError('PUBLIC_DO_NOT_EXPORT')
            self.assertEqual(caught.exception.tag,tag)
            self.assertNotIn('PUBLIC_DO_NOT_EXPORT',str(caught.exception))
        expected={'nonroot_required':'namespace_nonroot','capability_free_required':'namespace_capabilities',
            'network_interface_observation_invalid':'namespace_interfaces_invalid',
            'network_interface_observation_unavailable':'namespace_interfaces_unavailable',
            'private_loopback_network_required':'namespace_not_loopback',
            'independent_network_namespace_required':'namespace_not_independent',
            'PUBLIC_DO_NOT_EXPORT':'namespace_observation'}
        for reason,tag in expected.items():
            with self.assertRaises(b._StartupRejected) as caught:
                with b._startup_check('namespace_observation'):raise StagingAdmissionRejected(reason)
            self.assertEqual(caught.exception.tag,tag)

    def test_each_runtime_guard_failure_retains_its_phase(self):
        # Earlier internal component checks are stubbed solely to reach a later
        # failing check. No public entry, private namespace or live grant is made.
        def read(path):
            if str(path)=='/proc/self/mountinfo':return 'PUBLIC_FIXTURE_MOUNTS'
            if str(path)=='/proc/self/cgroup':return '0::/system.slice/public-fixture.service\n'
            return {'memory.max':str(512*1024**2),'memory.swap.max':'0','pids.max':'64'}[path.name]
        cases=('namespace_observation','production_pg_paths','broker_identity','broker_group_lookup',
            'broker_group_membership','prctl_library','prctl_dumpable','prctl_no_new_privileges',
            'db_work_inaccessible','mount_observation','app_work_tmpfs','credential_tmpfs',
            'cgroup_path','cgroup_memory','cgroup_swap','cgroup_tasks')
        for target in cases:
            with self.subTest(target=target),ExitStack() as stack:
                def stub(name,**kwargs):return stack.enter_context(patch(name,**kwargs))
                ns=stub(b.__name__+'._namespace_and_privileges',return_value=None)
                pg=stub(b.__name__+'._production_pg_inaccessible',return_value=None)
                user=stub(b.__name__+'.pwd.getpwuid',return_value=SimpleNamespace(pw_name=b.APP_USER))
                group=stub('grp.getgrnam',return_value=SimpleNamespace(gr_gid=12345))
                groups=stub(b.__name__+'.os.getgroups',return_value=[])
                stub(b.__name__+'.os.getegid',return_value=1000)
                libc=SimpleNamespace(prctl=lambda *args:0)
                library=stub(b.__name__+'.ctypes.CDLL',return_value=libc)
                access=stub(b.__name__+'.os.access',return_value=False)
                reader=stub(b.__name__+'.Path.read_text',autospec=True,side_effect=read)
                stub(b.__name__+'._mounts',return_value=[{'mount':p,'filesystem':'tmpfs','optional':[]} for p in (b.WORK,b.CREDENTIALS)])
                info=SimpleNamespace(st_mode=0o40700,st_uid=os.getuid())
                metadata=stub(b.__name__+'.os.lstat',return_value=info)
                stub(b.__name__+'.os.statvfs',return_value=SimpleNamespace(f_blocks=1024,f_frsize=4096))
                error=OSError('PUBLIC_DO_NOT_EXPORT')
                if target=='namespace_observation':ns.side_effect=error
                elif target=='production_pg_paths':pg.side_effect=error
                elif target=='broker_identity':user.return_value=SimpleNamespace(pw_name='PUBLIC_WRONG_USER')
                elif target=='broker_group_lookup':group.side_effect=error
                elif target=='broker_group_membership':groups.return_value=[12345]
                elif target=='prctl_library':library.side_effect=error
                elif target=='prctl_dumpable':libc.prctl=lambda *args:1
                elif target=='prctl_no_new_privileges':libc.prctl=lambda option,*args:int(option==38)
                elif target=='db_work_inaccessible':access.return_value=True
                elif target=='mount_observation':reader.side_effect=error
                elif target in ('app_work_tmpfs','credential_tmpfs'):
                    rejected=b.WORK if target=='app_work_tmpfs' else b.CREDENTIALS
                    metadata.side_effect=lambda path: (_ for _ in ()).throw(error) if path==rejected else info
                elif target=='cgroup_path':reader.side_effect=lambda path:'PUBLIC_INVALID' if str(path)=='/proc/self/cgroup' else read(path)
                else:
                    file={'cgroup_memory':'memory.max','cgroup_swap':'memory.swap.max','cgroup_tasks':'pids.max'}[target]
                    bad={'cgroup_memory':'max','cgroup_swap':'1','cgroup_tasks':'65'}[target]
                    reader.side_effect=lambda path:bad if path.name==file else read(path)
                with self.assertRaises(b._StartupRejected) as caught:b._observe_app_runtime(b.APP_USER)
                self.assertEqual(caught.exception.tag,target)

    def test_child_constructor_checks_do_not_get_misattributed_to_assets(self):
        assets=SimpleNamespace(node_path='/PUBLIC_FIXTURE_NODE')
        for target in ('namespace_cookie','children_identity','tool_installation','node_version'):
            with self.subTest(target=target),ExitStack() as stack:
                cookie=stack.enter_context(patch.object(b,'observe_network_namespace_cookie',return_value=1))
                user=stack.enter_context(patch.object(b.pwd,'getpwuid',return_value=SimpleNamespace(pw_name=b.APP_USER)))
                tools=stack.enter_context(patch.object(b,'_tools',return_value=(Path('/PUBLIC_FIXTURE_PG'),None)))
                version=stack.enter_context(patch.object(b.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout=b'PUBLIC_DO_NOT_EXPORT')))
                if target=='namespace_cookie':cookie.side_effect=OSError('PUBLIC_DO_NOT_EXPORT')
                elif target=='children_identity':user.return_value=SimpleNamespace(pw_name='PUBLIC_WRONG_USER')
                elif target=='tool_installation':tools.side_effect=OSError('PUBLIC_DO_NOT_EXPORT')
                with self.assertRaises(b._StartupRejected) as caught:b._FixedChildren(assets)
                self.assertEqual(caught.exception.tag,target)

    def test_actual_refusal_bytes_cross_owned_pipe_and_bounded_host_capture(self):
        code="""import sys
sys.path.insert(0,sys.argv[1])
from deployment.staging.vnext.t17_keyfd import t18_app_broker as b
try:
 with b._startup_check('cgroup_memory'):raise OSError('PUBLIC_DO_NOT_EXPORT')
except BaseException as error:b._emit_refusal(b.APP_USER,error)
raise SystemExit(2)
"""
        child=subprocess.Popen([sys.executable,'-I','-B','-c',code,str(ROOT)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
        capture=host._Capture(child,d.BROKER_REFUSAL_MAX_BYTES)
        self.assertEqual(child.wait(timeout=5),2)
        out,err=capture.finish();self.assertEqual(err,b'')
        value=host._failed_broker_diagnostic('APP',2,out)
        self.assertEqual(value['tag'],'cgroup_memory');self.assertNotIn('PUBLIC_DO_NOT_EXPORT',json.dumps(value))
        for code in (0,1,-15):self.assertEqual(host._failed_broker_diagnostic('APP',code,out),{'status':'NO_VALID_REFUSAL_RECORD'})
        self.assertEqual(host._failed_broker_diagnostic('REST',2,out),{'status':'NO_VALID_REFUSAL_RECORD'})

    def test_actual_overflow_keeps_draining_but_cannot_export(self):
        child=subprocess.Popen([sys.executable,'-I','-B','-c',"import sys;sys.stdout.buffer.write(b'P'*1048576)"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
        capture=host._Capture(child,d.BROKER_REFUSAL_MAX_BYTES)
        self.assertEqual(child.wait(timeout=5),0)
        with self.assertRaises(host.HostRejected):capture.finish()
        self.assertLessEqual(len(capture.buffers[0]),512)
        self.assertIsNone(d.project_broker_refusal(bytes(capture.buffers[0]),'APP'))


if __name__=='__main__':unittest.main()

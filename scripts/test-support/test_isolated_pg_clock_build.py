import hashlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('clock', Path(__file__).with_name('isolated_pg_clock_build.py'))
clock = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clock)


def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as target:
        for name, data, kind in entries:
            item = tarfile.TarInfo(name)
            item.type = kind
            item.size = len(data) if kind == tarfile.REGTYPE else 0
            if kind == tarfile.SYMTYPE:
                item.linkname = '/tmp/untrusted'
            target.addfile(item, io.BytesIO(data))
    return output.getvalue()


def verify(data):
    return clock.verified_members(data, hashlib.sha256(data).hexdigest())


class ClockBuildTest(unittest.TestCase):
    def test_new_output_refuses_overwrite_symlink_and_relative(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            p = clock.new_output(str(root / 'new'))
            self.assertEqual(p.stat().st_mode & 0o777, 0o700)
            for invalid in (str(p), 'relative', str(root / '..' / 'bad')):
                with self.assertRaises(clock.BuildFailure):
                    clock.new_output(invalid)
            (root / 'link').symlink_to(p, target_is_directory=True)
            with self.assertRaises(clock.BuildFailure):
                clock.new_output(str(root / 'link' / 'new'))

    def test_inventory_validates_before_extracting_and_preserves_license(self):
        data = archive([(clock.PREFIX + '/COPYING', b'license', tarfile.REGTYPE),
                        (clock.PREFIX + '/src/Makefile', b'not executed', tarfile.REGTYPE)])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clock.extract_verified(verify(data), root)
            self.assertEqual((root / clock.PREFIX / 'COPYING').read_bytes(), b'license')
            self.assertEqual(len(list(root.rglob('*'))), 4)

    def test_wrong_hash_and_compressed_bounds_fail_before_tar_parse(self):
        with patch.object(clock.tarfile, 'open', side_effect=AssertionError('must not parse')):
            for data in (b'', b'not the pinned source', b'x' * (clock.MAX_ARCHIVE + 1)):
                with self.assertRaises(clock.BuildFailure):
                    clock.verified_members(data)

    def test_traversal_duplicate_link_device_and_bad_prefix_fail(self):
        for name in ('/absolute', clock.PREFIX + '/../escape', 'other/src/file',
                     clock.PREFIX + '//duplicate', clock.PREFIX + '/./file', clock.PREFIX + '/back\\slash'):
            with self.subTest(name=name), self.assertRaises(clock.BuildFailure):
                verify(archive([(name, b'x', tarfile.REGTYPE)]))
        name = clock.PREFIX + '/src/file'
        for entries in ([(name, b'x', tarfile.REGTYPE)] * 2,
                        [(name, b'', tarfile.SYMTYPE)], [(name, b'', tarfile.LNKTYPE)],
                        [(name, b'', tarfile.CHRTYPE)]):
            with self.assertRaises(clock.BuildFailure):
                verify(archive(entries))

    def test_entry_and_expanded_bounds(self):
        with self.assertRaisesRegex(clock.BuildFailure, 'archive_entries'):
            verify(archive([(clock.PREFIX + '/' + str(i), b'', tarfile.REGTYPE) for i in range(257)]))
        with self.assertRaisesRegex(clock.BuildFailure, 'archive_expanded_size'):
            verify(archive([(clock.PREFIX + '/huge', b'0' * (clock.MAX_SOURCE + 1), tarfile.REGTYPE)]))

    def test_build_environment_isolates_inherited_injection(self):
        variables = {'MAKEFILES': '/dev/stdin', 'MAKEFLAGS': '--eval=malicious', 'MFLAGS': 'bad',
                     'CC': '/bad', 'CFLAGS': '-bad', 'CPPFLAGS': '-bad', 'LDFLAGS': '-bad',
                     'LD_PRELOAD': '/bad', 'DYLD_INSERT_LIBRARIES': '/bad', 'PYTHONPATH': '/bad',
                     'FAKETIME': '+3600'}
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, variables):
            result = clock.bounded_command([sys.executable, '-I', '-S', '-c',
                'import os,json; print(json.dumps(dict(os.environ)))'], temporary, timeout=2)
        import json
        child = json.loads(result)
        for variable in variables:
            self.assertNotIn(variable, child)
        self.assertEqual(child['PATH'], '/usr/bin:/bin')

    def test_output_overflow_and_timeout_are_bounded(self):
        with tempfile.TemporaryDirectory() as temporary:
            start = time.monotonic()
            with self.assertRaisesRegex(clock.BuildFailure, 'build_output_limit'):
                clock.bounded_command([sys.executable, '-I', '-c', "print('x'*20000)"],
                                      temporary, timeout=1, output_limit=1000)
            with self.assertRaisesRegex(clock.BuildFailure, 'build_deadline'):
                clock.bounded_command([sys.executable, '-I', '-c', 'import time; time.sleep(20)'],
                                      temporary, timeout=0.05)
            self.assertLess(time.monotonic() - start, 4)

    def test_timeout_stops_descendant_and_never_cleans_unconfirmed_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            # Child keeps stdout open after the leader exits. Its delayed write
            # must never occur, even if a container init retains the dead zombie.
            code = ('import os,time; pid=os.fork(); '
                    'time.sleep(0.6) if pid==0 else None; '
                    'open("late-write","w").write("bad") if pid==0 else None')
            with self.assertRaisesRegex(clock.BuildFailure, 'build_deadline|build_cleanup_unconfirmed'):
                clock.bounded_command([sys.executable, '-I', '-c', code], root, timeout=0.08)
            time.sleep(0.65)
            self.assertFalse((root / 'late-write').exists())
            self.assertTrue(root.is_dir())

    def test_unconfirmed_cleanup_never_returns_success(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(clock, 'group_exists', return_value=True):
            with self.assertRaisesRegex(clock.BuildFailure, 'build_cleanup_unconfirmed'):
                clock.bounded_command([sys.executable, '-I', '-c', 'pass'], temporary, timeout=1)
            self.assertTrue(Path(temporary).exists())

    def test_redirect_is_rejected(self):
        with self.assertRaisesRegex(clock.BuildFailure, 'archive_redirect_rejected'):
            clock.NoRedirect().redirect_request(None, None, None, None, None, None)

    def test_managed_transport_proxy_is_preserved_without_credentials_or_fallback(self):
        proxy = 'http://proxy:8080'
        self.assertEqual(clock.configured_proxy({'HTTPS_PROXY': proxy, 'http_proxy': proxy}), {'https': proxy})
        self.assertEqual(clock.configured_proxy({}), {})
        for invalid in ('http://user:secret@proxy:8080', 'file:///tmp/socket',
                        'http://proxy:8080/?credential=bad', 'http://proxy:bad', 'http://proxy/path'):
            with self.assertRaises(clock.BuildFailure):
                clock.configured_proxy({'HTTPS_PROXY': invalid})
        with self.assertRaisesRegex(clock.BuildFailure, 'conflicting_transport_proxy'):
            clock.configured_proxy({'HTTPS_PROXY': proxy, 'http_proxy': 'http://other:8080'})

    def test_download_size_and_alarm_restoration(self):
        class Response:
            status = 200
            def geturl(self): return clock.URL
            def read(self, limit):
                self.limit = limit
                return b'x' * limit
            def __enter__(self): return self
            def __exit__(self, *_args): self.closed = True
        response = Response()
        with patch.object(clock.urllib.request, 'build_opener') as opener, \
                patch.object(clock.signal, 'setitimer') as timer:
            opener.return_value.open.return_value = response
            with self.assertRaisesRegex(clock.BuildFailure, 'archive_too_large'):
                clock.download_archive()
            self.assertEqual(response.limit, clock.MAX_ARCHIVE + 1)
            self.assertTrue(response.closed)
            self.assertEqual(timer.call_args_list[0].args, (clock.signal.ITIMER_REAL, 15))
            self.assertEqual(timer.call_args_list[-1].args, (clock.signal.ITIMER_REAL, 0))

    def test_existing_alarm_is_not_overwritten(self):
        with patch.object(clock.signal, 'getitimer', return_value=(1.0, 0.0)), \
                patch.object(clock.signal, 'setitimer') as timer:
            with self.assertRaisesRegex(clock.BuildFailure, 'existing_alarm'):
                clock.download_archive()
            timer.assert_not_called()

    def test_symbol_diagnostic_is_bounded_and_never_substitutes_success(self):
        with patch.object(clock.Path, 'is_file', return_value=True), \
                patch.object(clock, 'bounded_command', side_effect=clock.BuildFailure('build_deadline')) as command:
            result = clock.inspect_failed_symbol_command(['/usr/bin/nm', '-D', '/tmp/library'], '/tmp')
            self.assertFalse(result['traceCompleted'])
            self.assertEqual(command.call_args.kwargs['timeout'], 3)
            self.assertEqual(command.call_args.args[0][:3], ['/usr/bin/strace', '-f', '-tt'])
        with patch.object(clock.Path, 'is_file', return_value=False), patch.object(clock, 'bounded_command') as command:
            self.assertEqual(clock.inspect_failed_symbol_command([], '/tmp'), {'trace': 'strace_unavailable'})
            command.assert_not_called()


if __name__ == '__main__':
    unittest.main()

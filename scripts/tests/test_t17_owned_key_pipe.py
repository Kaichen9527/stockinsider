"""Synthetic binary keys in actual anonymous OS pipes; no secret/backend IO."""
import importlib.util
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[2] / 'deployment/staging/vnext/t17_keyfd/owned_pipe.py'
spec = importlib.util.spec_from_file_location('owned_pipe', SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class OwnedKeyPipeTests(unittest.TestCase):
    def pipe(self, payload, eof=True):
        r, w = os.pipe()
        if payload:
            os.write(w, payload)
        if eof:
            os.close(w)
        else:
            self.addCleanup(os.close, w)
        return r

    def closed(self, fd):
        with self.assertRaises(OSError):
            os.fstat(fd)

    def test_success_requires_eof_closes_before_yield_and_wipes(self):
        r = self.pipe(bytes(range(32)))
        with m.borrow_key_from_owned_pipe(r) as key:
            self.closed(r)
            self.assertEqual(key, bytes(range(32)))
            retained = key
        self.assertEqual(retained, bytes(32))

    def test_every_short_length_and_extra_byte_rejected_before_consumer(self):
        for length in [*range(32), 33, 100]:
            with self.subTest(length=length):
                r = self.pipe(bytes(length))
                with self.assertRaisesRegex(m.KeyPipeRejected, '^key_pipe_length$'):
                    with m.borrow_key_from_owned_pipe(r):
                        self.fail('consumer_reached')
                self.closed(r)

    def test_exact_length_without_eof_times_out_and_closes(self):
        r = self.pipe(bytes(32), eof=False)
        start = time.monotonic()
        with self.assertRaisesRegex(m.KeyPipeRejected, '^key_pipe_deadline$'):
            with m.borrow_key_from_owned_pipe(r):
                self.fail('consumer_reached')
        self.assertLess(time.monotonic() - start, 2)
        self.closed(r)

    def test_empty_open_pipe_times_out(self):
        r = self.pipe(b'', eof=False)
        with self.assertRaisesRegex(m.KeyPipeRejected, '^key_pipe_deadline$'):
            with m.borrow_key_from_owned_pipe(r):
                self.fail('consumer_reached')
        self.closed(r)

    def test_delayed_chunked_writer_and_closed_writer(self):
        r, w = os.pipe()
        def producer():
            try:
                for _ in range(32):
                    os.write(w, b'\x71')
                    time.sleep(.001)
            finally:
                os.close(w)
        t = threading.Thread(target=producer)
        t.start()
        try:
            with m.borrow_key_from_owned_pipe(r) as key:
                self.assertEqual(key, b'\x71' * 32)
        finally:
            t.join(timeout=2)
        self.assertFalse(t.is_alive())

    def test_consumer_error_and_abort_wipe(self):
        for error in (BrokenPipeError(), KeyboardInterrupt()):
            r = self.pipe(b'\x71' * 32)
            with self.assertRaises(type(error)):
                with m.borrow_key_from_owned_pipe(r) as key:
                    retained = key
                    raise error
            self.assertEqual(retained, bytes(32))
            self.closed(r)

    def test_io_error_clears_partial_mutable_storage_and_closes(self):
        r = self.pipe(bytes(32))
        captured = []
        def fail_read(fd, buffers):
            buffers[0][:3] = b'abc'
            captured.append(buffers[0])
            raise OSError('never_publish_this')
        with patch.object(m.os, 'readv', side_effect=fail_read):
            with self.assertRaisesRegex(m.KeyPipeRejected, '^key_pipe_io_rejected$'):
                with m.borrow_key_from_owned_pipe(r):
                    self.fail('consumer_reached')
        self.assertEqual(captured[0], bytes(33))
        self.closed(r)

    def test_read_abort_closes_and_wipes(self):
        r = self.pipe(bytes(32))
        with patch.object(m.os, 'readv', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                with m.borrow_key_from_owned_pipe(r):
                    self.fail('consumer_reached')
        self.closed(r)

    def test_invalid_selectors_never_close_stdio(self):
        for selector in (None, True, '3', -1, 0, 1, 2):
            with self.assertRaises(m.KeyPipeRejected):
                with m.borrow_key_from_owned_pipe(selector):
                    self.fail('consumer_reached')
        os.fstat(1)

    def test_regular_file_and_write_end_rejected_and_closed(self):
        with tempfile.TemporaryFile() as f:
            r = os.dup(f.fileno())
            with self.assertRaises(m.KeyPipeRejected):
                with m.borrow_key_from_owned_pipe(r):
                    self.fail('consumer_reached')
            self.closed(r)
        r, w = os.pipe()
        os.close(r)
        with self.assertRaises(m.KeyPipeRejected):
            with m.borrow_key_from_owned_pipe(w):
                self.fail('consumer_reached')
        self.closed(w)


if __name__ == '__main__':
    unittest.main()

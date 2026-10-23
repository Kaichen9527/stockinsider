"""Exact workflow serialization excerpt; synthetic metadata, no PG/socket/env."""
import base64
import hashlib
import json
from pathlib import Path
import textwrap
import unittest
import zlib

SOURCE = Path('.github/workflows/stockinsider-vnext-quality.yml').read_text()
START = SOURCE.index('                  canonical=json.dumps(item,sort_keys=True')
END = SOURCE.index('          if receipt.exists():', START)
EXCERPT = textwrap.dedent(SOURCE[START:END])
SUBJECT = 'a' * 40


def emit(value):
    lines = []
    exec(compile(EXCERPT, '<exact-workflow-reachability-excerpt>', 'exec'),
         dict(base64=base64, hashlib=hashlib, json=json, zlib=zlib,
              item=value, runtime_source=SUBJECT, print=lines.append))
    return [json.loads(line.split('::', 2)[2]) for line in lines]


def restore(parts):
    if not parts:
        raise ValueError('missing parts')
    first = parts[0]
    expected = {'schema', 'sourceCommit', 'codec', 'part', 'parts', 'canonicalBytes',
                'canonicalSha256', 'compressedSha256', 'data'}
    if any(set(p) != expected for p in parts) or first['sourceCommit'] != SUBJECT or first['schema'] != 'vnext-safe-reachability-part-v1' or first['codec'] != 'zlib-base64-canonical-ascii-json':
        raise ValueError('unknown or cross-source binding')
    if len(parts) != first['parts'] or sorted(p['part'] for p in parts) != list(range(len(parts))):
        raise ValueError('missing or duplicate part')
    keys = set(first) - {'part', 'data'}
    if any(any(p[k] != first[k] for k in keys) for p in parts):
        raise ValueError('mixed input/hash binding')
    packed = base64.b64decode(''.join(p['data'] for p in sorted(parts, key=lambda p: p['part'])), validate=True)
    if hashlib.sha256(packed).hexdigest() != first['compressedSha256']:
        raise ValueError('compressed bytes drift')
    decoder = zlib.decompressobj()
    raw = decoder.decompress(packed, 262144)
    if not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
        raise ValueError('bounded complete stream required')
    if len(raw) != first['canonicalBytes'] or hashlib.sha256(raw).hexdigest() != first['canonicalSha256']:
        raise ValueError('canonical bytes drift')
    return json.loads(raw)


class SourceCodec(unittest.TestCase):
    def test_exact_bytes_roundtrip_and_bound_under_actual_4096_annotation_limit(self):
        item = {'target': 'synthetic-role', 'tables': [], 'routines': [
            {'signature': f'synthetic_{n}()', 'owner': 'fixed-synthetic-role',
             'definitionSha256': hashlib.sha256(str(n).encode()).hexdigest(),
             'securityDefiner': True} for n in range(100)]}
        self.assertGreater(len(json.dumps(item)), 4096)
        parts = emit(item)
        self.assertEqual(restore(parts[::-1]), item)
        self.assertTrue(all(len(json.dumps(p).encode()) < 3000 for p in parts))
        self.assertTrue(all(p['sourceCommit'] == SUBJECT for p in parts))

    def test_missing_duplicate_cross_subject_or_single_byte_drift_rejected(self):
        parts = emit({'rows': [hashlib.sha256(str(n).encode()).hexdigest() for n in range(100)]})
        self.assertGreater(len(parts), 1)
        mutants = [parts[:-1], parts + [parts[0]]]
        mixed = json.loads(json.dumps(parts)); mixed[0]['sourceCommit'] = 'b' * 40; mutants.append(mixed)
        unknown = json.loads(json.dumps(parts)); unknown[0]['extra'] = True; mutants.append(unknown)
        drift = json.loads(json.dumps(parts)); drift[0]['data'] = ('A' if drift[0]['data'][0] != 'A' else 'B') + drift[0]['data'][1:]; mutants.append(drift)
        for mutant in mutants:
            with self.assertRaises((ValueError, zlib.error)):
                restore(mutant)

    def test_excessive_report_refuses_without_emitting_partial_notices(self):
        with self.assertRaisesRegex(SystemExit, 'finite reachability chunk bound required'):
            emit({'rows': [hashlib.sha256(str(n).encode()).hexdigest() for n in range(5000)]})

    def test_main_routine_notice_keeps_report_out_and_codec_has_fixed_scope(self):
        self.assertNotIn("safe['sourceNamespaceDirectReachability']", SOURCE)
        self.assertIn("'sourceCommit':runtime_source", EXCERPT)
        self.assertNotIn('read_text', EXCERPT)
        self.assertNotIn('environ', EXCERPT)


if __name__ == '__main__':
    unittest.main()

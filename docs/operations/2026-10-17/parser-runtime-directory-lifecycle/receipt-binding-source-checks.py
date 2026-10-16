"""Memory-only extracted-main contracts; never import the lifecycle harness."""
import ast
import contextlib
import hashlib
import io
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / 'scripts/parser-runtime-directory-lifecycle.py'
sha = lambda b: hashlib.sha256(b).hexdigest()


def simulate(source, mode='PASS'):
    tree = ast.parse(source)
    main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
    files = {'harness': b'harness', 'workflow': b'workflow', 'unit': b'unit'}
    class MemoryPath:
        def __init__(self, name): self.name = name
        def __truediv__(self, name): return MemoryPath(self.name + '/' + name)
        def read_bytes(self):
            if self.name not in files: raise FileNotFoundError(self.name)
            return files[self.name]
        def write_text(self, value): files[self.name] = value.encode()
    def write_json(p, value):
        p.write_text(json.dumps(value, sort_keys=True, indent=2) + '\n')
        if p.name.endswith('/source-pins.json') and mode == 'PIN_MISMATCH':
            value['workflowSha256'] = '0' * 64
            p.write_text(json.dumps(value, sort_keys=True, indent=2) + '\n')
    class FakeLab:
        def __init__(self, output):
            self.output = MemoryPath(output); self.script = MemoryPath('harness')
            self.script_hash = sha(files['harness']); self.workflow_hash = sha(files['workflow'])
            self.cases = []; self.units = {'finite': 'fixture'}; self.events = [{'event': 'synthetic'}]
            self.violation = None; self.minimum = {}; self.peak = 0
        def admission(self):
            if mode == 'NOT_READY': raise RuntimeError('synthetic admission refusal')
        def case(self, name, call): call(); self.cases.append({'name': name})
        def baseline(self, fields):
            if mode == 'FAIL': raise RuntimeError('synthetic case refusal')
        def candidate(self, fields): self.cases.extend([{'name': str(i)} for i in range(3)])
        def cleanup(self): return {'confirmed': mode != 'CLEANUP_UNKNOWN'}
        def postrun(self): return {'confirmed': True}
    def semantics():
        if mode == 'MISSING_PIN': raise ValueError('synthetic semantics refusal')
        return {'synthetic': 'source contract only'}
    ns = dict(Lab=FakeLab, semantics=semantics, write_json=write_json, digest=sha,
              WORKFLOW=MemoryPath('workflow'), UNIT=MemoryPath('unit'), FROZEN=sha(b'unit'),
              ORIGINAL='original', json=json)
    exec(compile(ast.Module(body=[main], type_ignores=[]), '<extracted-main>', 'exec'), ns)
    with contextlib.redirect_stdout(io.StringIO()): code = ns['main']('out')
    return code, json.loads(files['out/receipt.json']), files


def verify(receipt, files):
    inventory = receipt['evidenceInventory']
    assert [x['name'] for x in inventory] == ['events.json', 'fixture-units.json', 'source-pins.json']
    for item in inventory:
        assert set(item) == {'name', 'bytes', 'sha256'}
        raw = files['out/' + item['name']]
        assert item['bytes'] == len(raw) and item['sha256'] == sha(raw)
    pins = json.loads(files['out/source-pins.json'])
    for key in ('harnessSha256', 'workflowSha256', 'unitSha256'):
        assert receipt[key] == pins[key]
    assert receipt['inputSeal'] == 'source-pins.json'


def run(source):
    groups = []
    code, receipt, files = simulate(source)
    assert code == 0 and receipt['status'] == 'PASS' and len(receipt['cases']) == 4
    verify(receipt, files); groups.append('exact serialized bytes and input seal')
    for name in ('events.json', 'fixture-units.json', 'source-pins.json'):
        changed = dict(files); changed['out/' + name] += b' '
        try: verify(receipt, changed)
        except AssertionError: pass
        else: raise AssertionError('single byte drift accepted: ' + name)
        groups.append('single byte drift rejected: ' + name)
    for mode in ('FAIL', 'NOT_READY'):
        code, receipt, files = simulate(source, mode)
        assert code == 1 and receipt['status'] == mode and len(receipt['cases']) == 0
        verify(receipt, files); groups.append(mode + ' binds actual existing evidence')
    code, receipt, files = simulate(source, 'MISSING_PIN')
    assert code == 1 and receipt['status'] == 'NOT_READY'
    assert receipt['evidenceInventory'][-1] == {'name': 'source-pins.json', 'bytes': None, 'sha256': None}
    assert receipt['evidenceBindingErrors'] == [{'name': 'source-pins.json', 'error': 'FileNotFoundError'}]
    groups.append('missing seal explicit; no invented evidence')
    code, receipt, files = simulate(source, 'PIN_MISMATCH')
    assert code == 1 and receipt['status'] == 'FAIL' and receipt['evidenceBindingErrors']
    groups.append('pin mismatch demotes otherwise successful run')
    code, receipt, files = simulate(source, 'CLEANUP_UNKNOWN')
    assert code == 1 and receipt['status'] == 'FAIL'; verify(receipt, files)
    groups.append('cleanup guard preserved')
    code, receipt, files = simulate(source)
    files['out/unknown-secret-file'] = b'not read'
    verify(receipt, files)
    assert len(receipt['evidenceInventory']) == 3 and 'receipt.json' not in [x['name'] for x in receipt['evidenceInventory']]
    groups.append('closed allowlist; no self reference or unknown file')
    return groups

if __name__ == '__main__':
    source = Path(sys.argv[1]).read_text() if len(sys.argv) > 1 else SOURCE.read_text()
    groups = run(source)
    print(json.dumps({'scope': 'memory-only source contract; no native execution', 'pass': len(groups), 'fail': 0, 'groups': groups}, indent=2))

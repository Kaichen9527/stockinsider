"""Extract only cleanup's observed-state decision; no harness import or OS action."""
import ast
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / 'scripts/parser-runtime-directory-lifecycle.py'
GOOD = {'LoadState': 'loaded', 'ActiveState': 'inactive', 'SubState': 'dead', 'MainPID': '0'}
FAILED = dict(GOOD, ActiveState='failed', SubState='failed')


def extract(source):
    tree = ast.parse(source)
    lab = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Lab')
    cleanup = next(n for n in lab.body if isinstance(n, ast.FunctionDef) and n.name == 'cleanup')
    loop = next(n for n in cleanup.body if isinstance(n, ast.For))
    body = loop.body[0].body
    start = next(i for i, n in enumerate(body) if isinstance(n, ast.Assign) and
                 any(isinstance(t, ast.Name) and t.id == 'state' for t in n.targets)) + 1
    end = next(i for i in range(start, len(body)) if isinstance(body[i], ast.Expr) and
               isinstance(body[i].value, ast.Call) and isinstance(body[i].value.func, ast.Attribute) and
               isinstance(body[i].value.func.value, ast.Name) and body[i].value.func.value.id == 'observations')
    return compile(ast.Module(body=body[start:end], type_ignores=[]), '<exact-cleanup-state-branch>', 'exec')


def invoke(code, initial, after=None, reset_error=None, show_error=None):
    calls = []
    class Fake:
        def ctl(self, *args):
            calls.append(('ctl', *args))
            if reset_error is not None: raise reset_error
        def show(self, name):
            calls.append(('show', name))
            if show_error is not None: raise show_error
            return dict(after or GOOD)
    ns = {'state': dict(initial), 'self': Fake(), 'name': 'owned-fixture.service'}
    error = None
    try: exec(code, ns)
    except Exception as e: error = e
    return calls, error, ns['state']


def run(source):
    code = extract(source); groups = []
    calls, error, state = invoke(code, GOOD, reset_error=RuntimeError('reset exit1: Unit not loaded'))
    assert error is None and calls == [] and state == GOOD
    groups.append('inactive/dead/PID0 skips reset-failed')
    calls, error, state = invoke(code, FAILED)
    assert error is None and state == GOOD
    assert calls == [('ctl', 'reset-failed', 'owned-fixture.service'), ('show', 'owned-fixture.service')]
    groups.append('failed reset then independent show verifies inactive/dead/PID0')
    sentinel = RuntimeError('synthetic nonzero reset')
    calls, error, _ = invoke(code, FAILED, reset_error=sentinel)
    assert error is sentinel and calls == [('ctl', 'reset-failed', 'owned-fixture.service')]
    groups.append('reset nonzero propagates unchanged')
    for key, value in [('LoadState','not-found'), ('LoadState','unknown'), ('ActiveState','active'),
                       ('ActiveState','unknown'), ('SubState','exited'), ('MainPID','1'),
                       ('MainPID','garbage'), ('MainPID',''), ('MainPID',None), ('MainPID',0)]:
        calls, error, _ = invoke(code, dict(GOOD, **{key:value}))
        assert isinstance(error, RuntimeError) and str(error) == 'unit_not_settled' and not calls
        groups.append('initial rejects ' + key + '=' + repr(value))
    for key in GOOD:
        state = dict(GOOD); del state[key]
        calls, error, _ = invoke(code, state)
        assert isinstance(error, RuntimeError) and not calls
        groups.append('initial missing ' + key + ' rejected')
    calls, error, _ = invoke(code, dict(FAILED, SubState='unknown'))
    assert isinstance(error, RuntimeError) and not calls
    groups.append('unknown failed substate rejected')
    for key, value in [('LoadState','not-found'), ('ActiveState','failed'), ('SubState','exited'),
                       ('MainPID','1'), ('MainPID','bad')]:
        calls, error, _ = invoke(code, FAILED, after=dict(GOOD, **{key:value}))
        assert str(error) == 'unit_not_settled_after_reset' and len(calls) == 2
        groups.append('postreset drift rejected ' + key + '=' + repr(value))
    for key in GOOD:
        state = dict(GOOD); del state[key]
        calls, error, _ = invoke(code, FAILED, after=state)
        assert str(error) == 'unit_not_settled_after_reset' and len(calls) == 2
        groups.append('postreset missing ' + key + ' rejected')
    sentinel = PermissionError('synthetic show denied')
    calls, error, _ = invoke(code, FAILED, show_error=sentinel)
    assert error is sentinel and len(calls) == 2
    groups.append('postreset show failure propagates unchanged')
    return groups


if __name__ == '__main__':
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE
    groups = run(path.read_text())
    print(json.dumps({'scope':'memory-only extracted source branch; NOT systemd/native',
                      'pass':len(groups), 'fail':0, 'groups':groups}, indent=2))

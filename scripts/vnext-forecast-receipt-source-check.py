"""Exercise the actual workflow count expression in memory; never native TAP."""
import ast
import json
from pathlib import Path
import re
import textwrap

source = Path('.github/workflows/stockinsider-vnext-quality.yml').read_text()
blocks = re.findall(r"python3 - <<'PYCODE'\n([\s\S]*?)\n          PYCODE", source)
block = next(b for b in blocks if 'observedWitnesses' in b and 'actualTapCounts' in b)
tree = ast.parse(textwrap.dedent(block))
document = next(n for n in ast.walk(tree) if isinstance(n, ast.Dict)
                and any(isinstance(k, ast.Constant) and k.value == 'actualTapCounts' for k in n.keys))
index = next(i for i, k in enumerate(document.keys) if isinstance(k, ast.Constant) and k.value == 'actualTapCounts')
expression = compile(ast.Expression(document.values[index]), 'actual-workflow-count-expression', 'eval')

class MemoryTap:
    def __init__(self, content):
        self.content = content
    def __truediv__(self, name):
        assert name == 'preparation-http.tap'
        return self
    def read_bytes(self):
        return self.content

cases = [
    (b'# tests 7\n# pass 7\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n',
     {'tests': 7, 'pass': 7, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}),
    (b'# tests 3\n# pass 1\n# fail 2\n# cancelled 0\n# skipped 0\n# todo 0\n',
     {'tests': 3, 'pass': 1, 'fail': 2, 'cancelled': 0, 'skipped': 0, 'todo': 0}),
    (b'TAP version 13\n# evidence_incomplete: no final TAP count observed\n', {}),
]
for content, expected in cases:
    value = eval(expression, {'re': re, 'root': MemoryTap(content)})
    assert value == expected
    assert json.loads(json.dumps(value)) == expected
print('3 source-only actual-expression serialization cases PASS; synthetic TAP, no native claim')

"""Read-only verification of local relay/calculator/output bytes; no raw HTTP claim."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'hashes.json').read_text())
for name, expected in manifest['files'].items():
    assert Path(name).name == name, 'manifest must contain flat local names'
    raw = (root / name).read_bytes()
    assert len(raw) == expected['bytes'], name + ': byte count mismatch'
    assert hashlib.sha256(raw).hexdigest() == expected['sha256'], name + ': hash mismatch'
print(json.dumps({'fileHashesVerified': len(manifest['files']), 'failed': 0,
                  'rawHttpHashesReverified': False}))

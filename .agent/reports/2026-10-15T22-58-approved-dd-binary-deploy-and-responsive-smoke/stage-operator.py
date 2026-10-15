import base64, hashlib, json, os, pathlib, stat, sys, tempfile
assert os.geteuid() == 0
data = json.loads(sys.stdin.buffer.read(65537))
assert set(data) == {'files'}
assert {x['name'] for x in data['files']} == {'deploy.sh', 'operator-support.py', 'unit-profile.json'}
assert len(data['files']) == 3
for directory in [pathlib.Path('/run'), pathlib.Path('/')]:
    s = directory.lstat()
    assert stat.S_ISDIR(s.st_mode) and s.st_uid == 0 and not s.st_mode & 0o022
leaf = pathlib.Path(tempfile.mkdtemp(prefix='stockinsider-dd-reviewed-', dir='/run'))
os.chmod(leaf, 0o700)
records = []
for item in data['files']:
    assert set(item) == {'name', 'base64', 'bytes', 'sha256'}
    raw = base64.b64decode(item['base64'], validate=True)
    assert len(raw) == item['bytes'] and hashlib.sha256(raw).hexdigest() == item['sha256']
    p = leaf / item['name']
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    s = p.lstat()
    assert stat.S_ISREG(s.st_mode) and s.st_uid == 0 and s.st_nlink == 1 and stat.S_IMODE(s.st_mode) == 0o600
    assert hashlib.sha256(p.read_bytes()).hexdigest() == item['sha256']
    records.append({'name': item['name'], 'bytes': len(raw), 'sha256': item['sha256'], 'uid': s.st_uid, 'mode': stat.S_IMODE(s.st_mode), 'nlink': s.st_nlink})
print(json.dumps({'ownedLeaf': str(leaf), 'files': records, 'applicationArchiveStaged': False}))

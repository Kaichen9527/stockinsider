#!/usr/bin/env python3
"""Credential-free, bounded tests of the candidate's actual generated policy.
Not an independent review, model invocation, protected gate or release approval.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / '.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json'

def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    output = Path(args.output).absolute()
    if output.exists():
        raise ValueError('existing evidence must not be overwritten')
    pin_bytes = FIXTURE.read_bytes()
    if len(pin_bytes) != 2219 or hashlib.sha256(pin_bytes[:-1]).hexdigest() != '953b898dfa786675dd5e6dda3af4265ad49086929fb519c989c3629682eeaca1':
        raise ValueError('exact frozen candidate fixture required')
    pins = json.loads(pin_bytes)
    native = next(row for row in pins['executables'] if row['name'] == 'codex')
    for row in pins['executables']:
        path = Path(row['path'])
        st = path.lstat()
        identity = dict(device=str(st.st_dev), inode=str(st.st_ino), size=str(st.st_size), uid=st.st_uid, gid=st.st_gid, mode=format(st.st_mode, '06o'))
        if str(path.resolve()) != row['realpath'] or identity != row['stat'] or digest(path) != row['sha256']:
            raise ValueError('native host identity drift')
    root = Path(tempfile.mkdtemp(prefix='stockinsider-candidate-policy-')).resolve()
    root.chmod(0o700)
    view, scratch, transport = [root / name for name in ('view', 'scratch', 'transport')]
    for path in (view, scratch, transport):
        path.mkdir(mode=0o700)
    source = view / 'source.txt'
    source.write_text('synthetic source\n')
    outside = root / 'outside.txt'
    outside.write_text('synthetic private canary\n')
    auth = transport / 'auth.json'
    auth.write_text('{"synthetic_only":true,"real_credentials":false}\n')
    cache = Path(tempfile.mkdtemp(prefix='stockinsider-policy-canary-', dir=Path.home() / 'Library' / 'Caches'))
    cache.chmod(0o700)
    (cache / 'sentinel.txt').write_text('synthetic outside-operation canary\n')
    # The actual candidate adapter, not a retyped policy, supplies these bytes.
    adapter = ROOT / 'scripts/model-runner-v3/codexAdapter.js'
    generation = ['/usr/local/bin/node', '-e', 'const a=require(process.argv[1]);const [viewPath,scratchPath,transportPath]=process.argv.slice(2);console.log(JSON.stringify({profile:a.profileToml(viewPath,scratchPath,transportPath),env:a.sanitizedEnvironment({scratchPath,transportPath})}));', str(adapter), str(view), str(scratch), str(transport)]
    generated = subprocess.run(generation, capture_output=True, text=True, check=True, timeout=15)
    config_data = json.loads(generated.stdout)
    config = transport / 'model-runner-v3.config.toml'
    config.write_text(config_data['profile'])
    config.chmod(0o600)
    env = config_data['env']
    prefix = [native['path'], 'sandbox', '--profile', 'model-runner-v3', '--permission-profile', 'model-runner-v3', '-C', str(view), '--']
    receipt = dict(schema='actual-candidate-policy-canary-v1', observed_at=datetime.now(timezone.utc).isoformat(), real_credentials_loaded=False, model_invoked=False, protected_gate_authority=False, fixture_sha256=hashlib.sha256(pin_bytes).hexdigest(), adapter_sha256=digest(adapter), canary_script_sha256=digest(__file__), generation_argv=generation, generation_exit_code=generated.returncode, generated_stdout=generated.stdout, config_path=str(config), config_text=config_data['profile'], config_sha256=digest(config), environment=env, checks=[])
    def run(name, command, denied=False, sandbox=True):
        argv = (prefix if sandbox else []) + command
        before = digest(config)
        proc = subprocess.run(argv, cwd=view, env=env, capture_output=True, text=True, timeout=15)
        after = digest(config)
        valid = before == after == receipt['config_sha256']
        passed = proc.returncode != 0 and 'Operation not permitted' in proc.stderr if denied else proc.returncode == 0
        receipt['checks'].append(dict(name=name, argv=argv, cwd=str(view), config_sha256_before=before, config_sha256_after=after, exit_code=proc.returncode, stdout=proc.stdout, stderr=proc.stderr, expected='os_denial' if denied else 'success', passed=valid and passed))
        return proc
    run('source_read', ['/bin/cat', str(source)])
    run('source_write_denial', ['/bin/sh', '-c', 'printf no > "$1"', 'sh', str(view / 'forbidden.txt')], True)
    run('scratch_write', ['/bin/sh', '-c', 'printf yes > "$1"', 'sh', str(scratch / 'allowed.txt')])
    for name, path in [('private_sibling', outside), ('synthetic_transport_auth', auth), ('synthetic_user_cache', cache / 'sentinel.txt')]:
        run(name, ['/bin/cat', str(path)], True)
    run('descendant_transport_denial', ['/bin/sh', '-c', '/bin/sh -c \'exec /bin/cat "$1"\' inner "$1"', 'outer', str(auth)], True)
    connections = [0]
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            connections[0] += 1
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'local synthetic positive control')
        def log_message(self, *unused):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        curl = ['/usr/bin/curl', '--noproxy', '*', '--silent', '--show-error', '--max-time', '2', f'http://127.0.0.1:{server.server_port}/']
        run('loopback_positive_control', curl, sandbox=False)
        before = connections[0]
        proc = run('sandbox_network_denial', curl)
        final = receipt['checks'][-1]
        final['expected'] = 'network_denial_with_positive_control'
        final['passed'] = proc.returncode == 7 and before == 1 and connections[0] == before and final['config_sha256_before'] == final['config_sha256_after'] == receipt['config_sha256']
        receipt['sandbox_network_connections'] = connections[0] - before
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
    receipt['source_unmodified'] = source.read_text() == 'synthetic source\n' and not (view / 'forbidden.txt').exists()
    receipt['scratch_write_verified'] = (scratch / 'allowed.txt').is_file() and (scratch / 'allowed.txt').read_text() == 'yes'
    receipt['native_sha256_after'] = digest(native['path'])
    receipt['passed'] = len(receipt['checks']) == 9 and all(c['passed'] for c in receipt['checks']) and receipt['source_unmodified'] and receipt['scratch_write_verified'] and receipt['native_sha256_after'] == native['sha256']
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x') as stream:
        json.dump(receipt, stream, indent=2)
        stream.write('\n')
    print(json.dumps(dict(passed=receipt['passed'], checks=len(receipt['checks']), receipt_sha256=digest(output), protected_gate_authority=False)))
    return 0 if receipt['passed'] else 2

if __name__ == '__main__':
    raise SystemExit(main())

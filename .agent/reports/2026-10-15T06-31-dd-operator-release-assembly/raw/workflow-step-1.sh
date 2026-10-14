set -euo pipefail
umask 077
evidence="$(mktemp -d "$RUNNER_TEMP/dd-operator-quality.XXXXXX")"
echo "DD_OPERATOR_EVIDENCE=$evidence" >> "$GITHUB_ENV"
python3 -I -B - <<'PY' | tee "$evidence/environment.json"
import ctypes, json, os, pathlib, platform, shutil, sys
assert sys.implementation.name == 'cpython' and sys.version_info >= (3, 12), 'unsupported_python'
assert platform.system() == 'Linux' and os.name == 'posix', 'linux_required'
assert os.geteuid() != 0, 'unprivileged_probes_required'
assert sys.flags.optimize == 0 and not os.environ.get('PYTHONOPTIMIZE'), 'assertions_required'
assert pathlib.Path('/proc/self/stat').is_file() and pathlib.Path('/bin/bash').is_file(), 'proc_bash_required'
libc = ctypes.CDLL(None, use_errno=True)
subreaper = ctypes.c_int()
assert libc.prctl(37, ctypes.byref(subreaper), 0, 0, 0) == 0, 'linux_subreaper_required'
free = {p: shutil.disk_usage(p).free for p in (os.getcwd(), '/tmp')}
assert all(n >= 8 * 1024**3 for n in free.values()), 'disk_reserve_required'
print(json.dumps({'python': sys.version, 'platform': platform.platform(), 'proc': True, 'uid': os.geteuid(), 'freeBytes': free, 'subreaperSupported': True}))
PY
git rev-parse HEAD HEAD^{tree} > "$evidence/source.txt"
sha256sum docs/operations/2026-10-15/dd-binary-operator-candidate/* .github/workflows/dd-binary-operator-quality.yml > "$evidence/inputs.sha256"

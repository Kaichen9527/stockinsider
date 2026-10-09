"""Build a pinned test-only clock library; never install or preload this process."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import selectors
import shutil
import signal
import subprocess
import sys
import tarfile
import time
import urllib.request
import urllib.parse
import io

COMMIT = 'd475b925943ad404c6c728ac868dc73949e7281c'
ARCHIVE_SHA256 = '141d76954a430ee4a43dfdec8984c7507cf803a9f66b62853e5642e7131b42c8'
URL = 'https://codeload.github.com/wolfcw/libfaketime/tar.gz/' + COMMIT
PREFIX = 'libfaketime-' + COMMIT
MAX_ARCHIVE = 256 * 1024
MAX_SOURCE = 4 * 1024 * 1024
MAX_OUTPUT = 1024 * 1024
BUILD_ENV = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'LANG': 'C'}


class BuildFailure(RuntimeError):
    pass


def new_output(directory):
    p = Path(directory)
    if not p.is_absolute() or any(part in ('.', '..') for part in p.parts):
        raise BuildFailure('absolute_new_output_required')
    # Do not traverse a user-supplied symlink, including intermediate ancestors.
    for parent in reversed(p.parents):
        if parent.is_symlink() or not parent.is_dir():
            raise BuildFailure('output_parent_invalid')
    if p.parent.stat().st_uid != os.getuid():
        raise BuildFailure('output_parent_not_owned')
    try:
        p.mkdir(mode=0o700)
    except FileExistsError as error:
        raise BuildFailure('output_exists') from error
    return p


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise BuildFailure('archive_redirect_rejected')


def configured_proxy(environment=os.environ):
    # Preserve a managed environment's transport proxy/CA rather than attempting
    # direct egress. Credentials are never accepted or logged. No direct retry.
    values = {environment[key] for key in ('https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY')
              if environment.get(key)}
    if len(values) > 1:
        raise BuildFailure('conflicting_transport_proxy')
    if not values:
        return {}
    value = values.pop()
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username is not None
            or parsed.password is not None or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        raise BuildFailure('credential_free_transport_proxy_required')
    try:
        parsed.port
    except ValueError as error:
        raise BuildFailure('transport_proxy_port') from error
    return {'https': value}


def download_archive():
    # A real parent-process alarm bounds the entire request, not each socket read.
    if signal.getitimer(signal.ITIMER_REAL) != (0.0, 0.0):
        raise BuildFailure('existing_alarm')
    previous = signal.getsignal(signal.SIGALRM)
    def deadline(_signum, _frame):
        raise BuildFailure('archive_download_deadline')
    signal.signal(signal.SIGALRM, deadline)
    signal.setitimer(signal.ITIMER_REAL, 15)
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler(configured_proxy()), NoRedirect())
        request = urllib.request.Request(URL, headers={'User-Agent': 'StockInsider-test-clock/1'})
        with opener.open(request, timeout=15) as response:
            if response.status != 200 or response.geturl() != URL:
                raise BuildFailure('archive_response_invalid')
            data = response.read(MAX_ARCHIVE + 1)
            if len(data) > MAX_ARCHIVE:
                raise BuildFailure('archive_too_large')
            return data
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def verified_members(data, expected_hash=ARCHIVE_SHA256):
    if not data or len(data) > MAX_ARCHIVE:
        raise BuildFailure('archive_size')
    if hashlib.sha256(data).hexdigest() != expected_hash:
        raise BuildFailure('archive_hash')
    members, seen, total = [], set(), 0
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for entry in archive:
            if len(members) >= 256:
                raise BuildFailure('archive_entries')
            name = entry.name.rstrip('/')
            parts = name.split('/')
            if (not name or name.startswith('/') or '\\' in name
                    or any(part in ('', '.', '..') for part in parts)
                    or parts[0] != PREFIX or name in seen):
                raise BuildFailure('archive_path')
            seen.add(name)
            if not (entry.isdir() or entry.isfile()) or entry.size < 0:
                raise BuildFailure('archive_type')
            if entry.isdir() and entry.size != 0:
                raise BuildFailure('archive_directory_size')
            total += entry.size
            if total > MAX_SOURCE:
                raise BuildFailure('archive_expanded_size')
            content = b''
            if entry.isfile():
                with archive.extractfile(entry) as stream:
                    content = stream.read(entry.size + 1)
                if len(content) != entry.size:
                    raise BuildFailure('archive_truncated')
            members.append((PurePosixPath(name), entry.isdir(), content))
    if not members:
        raise BuildFailure('archive_empty')
    return members


def extract_verified(members, root):
    # Hash, all paths and the full inventory are validated before creating files.
    for name, is_directory, content in members:
        destination = root.joinpath(*name.parts)
        if is_directory:
            destination.mkdir(mode=0o700, parents=True, exist_ok=True)
        else:
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with destination.open('xb') as target:
                target.write(content)
            destination.chmod(0o600)


def group_exists(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # An uninspectable group is never a confirmed shutdown.


def stop_group(process):
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except PermissionError as error:
        raise BuildFailure('build_cleanup_unconfirmed') from error
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired as error:
        raise BuildFailure('build_cleanup_unconfirmed') from error
    until = time.monotonic() + 1
    while group_exists(process.pid) and time.monotonic() < until:
        time.sleep(0.01)
    if group_exists(process.pid):
        raise BuildFailure('build_cleanup_unconfirmed')


def bounded_command(arguments, cwd, timeout=30, output_limit=MAX_OUTPUT):
    process = subprocess.Popen(arguments, cwd=cwd, env=BUILD_ENV,
                               stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, start_new_session=True)
    output = bytearray()
    until = time.monotonic() + timeout
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while selector.get_map() or process.poll() is None:
                remaining = until - time.monotonic()
                if remaining <= 0:
                    raise BuildFailure('build_deadline')
                for key, _event in selector.select(min(remaining, 0.1)):
                    chunk = os.read(key.fd, min(65536, output_limit + 1 - len(output)))
                    output.extend(chunk)
                    if len(output) > output_limit:
                        raise BuildFailure('build_output_limit')
                    if not chunk:
                        selector.unregister(key.fileobj)
            if process.returncode != 0:
                raise BuildFailure('build_command_failed:' + output.decode('utf-8', errors='replace')[-4096:])
            if group_exists(process.pid):
                raise BuildFailure('build_descendants_remaining')
        return output.decode('utf-8', errors='replace')
    except BaseException:
        stop_group(process)
        raise
    finally:
        process.stdout.close()


def build(output_directory):
    if sys.platform != 'linux':
        raise BuildFailure('linux_build_required')
    output = new_output(output_directory)
    source = output / 'source'
    source.mkdir(mode=0o700)
    try:
        data = download_archive()
        members = verified_members(data)
        extract_verified(members, source)
        directory = source / PREFIX / 'src'
        compiler = bounded_command(['/usr/bin/cc', '--version'], output, timeout=3)
        make = bounded_command(['/usr/bin/make', '--version'], output, timeout=3)
        command = ['/usr/bin/make', '-f', 'Makefile', 'CC=/usr/bin/cc',
                   'FAKETIME_COMPILE_CFLAGS=-UFAKE_SLEEP', 'libfaketime.so.1']
        log = bounded_command(command, directory)
        library = directory / 'libfaketime.so.1'
        if library.is_symlink() or not library.is_file() or not 0 < library.stat().st_size <= 16 * 1024 * 1024:
            raise BuildFailure('built_library_invalid')
        # Dynamic defined symbols independently check the chosen build option.
        symbols = bounded_command(['/usr/bin/nm', '-D', '--defined-only', str(library)], output, timeout=3)
        forbidden = {'sleep', 'nanosleep', 'clock_nanosleep', '__nanosleep', 'usleep', 'alarm',
                     'poll', 'ppoll', 'epoll_wait', 'epoll_pwait', 'epoll_pwait2', 'select', 'pselect'}
        if any(line.split()[-1].split('@')[0] in forbidden for line in symbols.splitlines() if line.split()):
            raise BuildFailure('built_wait_wrapper_present')
        destination = output / 'libfaketime.so.1'
        with destination.open('xb') as target:
            target.write(library.read_bytes())
        destination.chmod(0o600)
        shutil.copyfile(source / PREFIX / 'COPYING', output / 'COPYING')
        receipt = {'schema': 'stockinsider-isolated-pg-clock-build-v1', 'sourceCommit': COMMIT,
                   'sourceUrl': URL, 'archiveSha256': ARCHIVE_SHA256, 'archiveBytes': len(data),
                   'compilerVersion': compiler.splitlines()[0], 'makeVersion': make.splitlines()[0],
                   'command': command, 'environment': BUILD_ENV,
                   'library': str(destination), 'librarySha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
                   'waitWrappersAbsent': True}
        (output / 'build.log').write_text(log)
        (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        shutil.rmtree(source)  # Only our source, after every child is confirmed stopped.
        return receipt
    except BaseException as error:
        (output / 'failure.json').write_text(json.dumps({'passed': False, 'reason': str(error)[:4096]}) + '\n')
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        if not sys.flags.isolated or not sys.flags.no_site:
            raise BuildFailure('isolated_python_required_use_I_S')
        print(json.dumps(build(args.output)))
    except Exception as error:
        print('isolated clock build failed: ' + str(error)[:4096], file=sys.stderr)
        sys.exit(1)

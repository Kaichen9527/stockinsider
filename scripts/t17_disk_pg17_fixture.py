#!/usr/bin/env python3
"""FIXTURE ONLY. No backup/key/executable/live-mode input accepted.

Before starting PG, prove disk fs-verity on a newly created inode AND observe a
loopback-only network namespace. Unsupported systems exit 2 with a refusal JSON.
Externally review/supervise filesystem quotas/cgroup/runtime isolation. This
does not implement or unlock the disabled live restore facade.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from deployment.staging.vnext.t17_keyfd.disk_custody import borrow_disk_snapshot, DiskCustodyRejected
from deployment.staging.vnext.t17_keyfd.stream_fixture_gcm import authenticate_then_replay, FixtureAuthenticationRejected
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

PG = Path('/usr/lib/postgresql/17/bin')
KEY, NONCE, CONTEXT = b'\x71' * 32, b'\x02' * 12, b'\xaa' * 32  # PUBLIC FIXTURE ONLY


def encrypt_fixture(source, target):
    header = b'SI-BACKUP-1\n' + NONCE + CONTEXT
    c = Cipher(algorithms.AES(KEY), modes.GCM(NONCE)).encryptor()
    c.authenticate_additional_data(header)
    with source.open('rb') as src, target.open('xb') as dst:
        dst.write(header)
        while chunk := src.read(1024 * 1024):
            dst.write(c.update(chunk))
        dst.write(c.finalize())
        dst.write(c.tag)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--scratch-parent', required=True)
    args = parser.parse_args()
    if os.getuid() == 0:
        raise SystemExit('nonroot_required')
    parent = Path(args.scratch_parent).resolve(strict=True)
    if not Path(args.scratch_parent).is_absolute() or not re.fullmatch(r'/[A-Za-z0-9/_-]+',str(parent)):
        raise SystemExit('absolute_scratch_parent_required')
    os.umask(0o077)
    root = Path(tempfile.mkdtemp(prefix='t17-public-fixture-', dir=parent))
    dfd = os.open(root, os.O_DIRECTORY | os.O_RDONLY | os.O_CLOEXEC)
    receipt = {'schema':'stockinsider-t17-disk-pg17-fixture-v1',
               'startedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'scope':'fixed_public_fixture_only', 'liveAuthority':False,
               'nativeHoldRetained':True, 'pgStarted':False, 'restoreVerified':False}
    pg = None
    pglog = None
    def alarm(*_):
        raise TimeoutError('fixture_deadline')
    signal.signal(signal.SIGALRM, alarm)
    signal.signal(signal.SIGTERM, alarm)
    signal.alarm(180)
    try:
        # Actual kernel capability is established BEFORE initdb or any SQL.
        probe = root / 'public-probe'
        probe.write_bytes(b'PUBLIC_FSVERITY_PROBE')
        with borrow_disk_snapshot(os.open(probe, os.O_RDONLY | os.O_CLOEXEC), dfd) as snapshot:
            if b''.join(snapshot.chunks()) != b'PUBLIC_FSVERITY_PROBE':
                raise RuntimeError('kernel_probe_content_rejected')
        receipt['diskKernelCustodyVerified'] = True
        if [name for _, name in socket.if_nameindex()] != ['lo']:
            raise RuntimeError('private_loopback_namespace_required')
        receipt['networkLoopbackOnly'] = True
        user = pwd.getpwuid(os.getuid()).pw_name
        data, sock = root / 'data', root / 'socket'
        sock.mkdir(mode=0o700)
        env = {'PATH':str(PG)+':/usr/bin:/bin', 'HOME':str(root), 'LC_ALL':'C',
               'PGHOST':str(sock),'PGPORT':'6547','PGUSER':user,'PGDATABASE':'postgres',
               'PGPASSFILE':'/dev/null','PGSERVICEFILE':'/dev/null','PGCONNECT_TIMEOUT':'3',
               'PGOPTIONS':'-c statement_timeout=5000 -c lock_timeout=2000'}
        def run(name, options):
            p = subprocess.run([str(PG / name), *options], env=env,
                               capture_output=True, text=True, timeout=25)
            if p.returncode:
                raise RuntimeError(name + '_failed')
            return p.stdout.strip()
        version = run('postgres', ['--version'])
        if ' 17.' not in version:
            raise RuntimeError('pg17_required')
        receipt['pgVersion'] = version
        run('initdb', ['-D',str(data),'-U',user,'--auth-local=peer',
                      '--auth-host=reject','--no-locale','--encoding=UTF8'])
        with (data / 'postgresql.conf').open('a') as f:
            f.write("\nlisten_addresses=''\nport=6547\nunix_socket_directories='"+str(sock)+"'\n"
                    "unix_socket_permissions=0700\nshared_buffers=16MB\nwork_mem=1MB\n"
                    "max_connections=4\nmax_worker_processes=0\nmax_parallel_workers=0\n"
                    "autovacuum=off\njit=off\nmax_wal_size=64MB\nmin_wal_size=32MB\n"
                    "wal_level=minimal\nmax_wal_senders=0\narchive_mode=off\ntemp_file_limit=16MB\n")
        pglog = (root / 'pg.log').open('wb')
        pg = subprocess.Popen([str(PG / 'postgres'),'-D',str(data)],env=env,
                              stdin=subprocess.DEVNULL,stdout=pglog,stderr=pglog)
        receipt['pgStarted'] = True
        def sql(db, text):
            return run('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-d',db,'-c',text])
        for _ in range(50):
            if pg.poll() is not None:
                raise RuntimeError('postgres_start_failed')
            try:
                sql('postgres','SELECT 1')
                break
            except RuntimeError:
                time.sleep(.1)
        else:
            raise RuntimeError('postgres_start_timeout')
        if sql('postgres',"SELECT current_setting('listen_addresses')='' AND current_setting('data_directory')="
               + "'"+str(data)+"'") != 't':
            raise RuntimeError('private_cluster_required')
        run('createdb',['fixture_source'])
        # Public StockInsider-shaped schema subset, all rows synthetic.
        sql('fixture_source', """CREATE TABLE stocks(id integer PRIMARY KEY, symbol text UNIQUE NOT NULL,
          market text NOT NULL CHECK(market IN ('TW','US')));
          CREATE TABLE stock_signals(id integer PRIMARY KEY, stock_id integer NOT NULL REFERENCES stocks,
          price numeric NOT NULL CHECK(price>=0));
          INSERT INTO stocks VALUES(1,'FIXTURE01','TW'),(2,'FIXTURE02','US');
          INSERT INTO stock_signals SELECT i,1,100+i FROM generate_series(1,12) i;""")
        def data_hash(db):
            result = sql(db,"SELECT json_build_object('stocks',(SELECT json_agg(s ORDER BY id) FROM stocks s),"
                         "'signals',(SELECT json_agg(s ORDER BY id) FROM stock_signals s))::text")
            return hashlib.sha256(result.encode()).hexdigest()
        expected = data_hash('fixture_source')
        archive, encrypted = root / 'fixture.dump', root / 'fixture.encrypted'
        run('pg_dump',['-Fc','--no-owner','--no-acl','-d','fixture_source','-f',str(archive)])
        encrypt_fixture(archive, encrypted)
        def pipe_consumer(snapshot, restore_args):
            # Lazy process launch: no TOC/restore child exists before GCM tag verification.
            child = None
            timer = None
            try:
                with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
                    def consume(chunk):
                        nonlocal child, timer
                        if child is None:
                            child = subprocess.Popen([str(PG/'pg_restore'),*restore_args],env=env,
                                                     stdin=subprocess.PIPE,stdout=output,stderr=errors)
                            timer = threading.Timer(20, child.kill)
                            timer.start()
                        child.stdin.write(chunk)
                    authenticate_then_replay(snapshot, KEY, CONTEXT, consume)
                    if child is None:
                        raise RuntimeError('empty_restore_input')
                    child.stdin.close()
                    if child.wait(timeout=25):
                        raise RuntimeError('pg_restore_failed')
                    output.seek(0)
                    return output.read(1024 * 1024)
            finally:
                if timer: timer.cancel()
                if child:
                    if child.poll() is None: child.kill()
                    child.wait(timeout=5)
        with borrow_disk_snapshot(os.open(encrypted, os.O_RDONLY | os.O_CLOEXEC), dfd) as snapshot:
            toc = pipe_consumer(snapshot,['--list'])
            receipt['tocSha256'] = hashlib.sha256(toc).hexdigest()
            run('createdb',['fixture_restored'])
            pipe_consumer(snapshot,['--exit-on-error','--no-owner','--no-acl','-d','fixture_restored'])
        if data_hash('fixture_restored') != expected or data_hash('fixture_source') != expected:
            raise RuntimeError('restored_hash_rejected')
        counts = sql('fixture_restored',"SELECT (SELECT count(*) FROM stocks)||':'||(SELECT count(*) FROM stock_signals)")
        if counts != '2:12':
            raise RuntimeError('fixture_counts_rejected')
        constraints = int(sql('fixture_restored', "SELECT count(*) FROM pg_constraint WHERE conrelid IN ('stocks'::regclass,'stock_signals'::regclass)"))
        if constraints != 6 or sql('fixture_restored', "SELECT count(*) FROM stock_signals s LEFT JOIN stocks t ON t.id=s.stock_id WHERE t.id IS NULL") != '0':
            raise RuntimeError('fixture_relations_rejected')
        for invalid in ("INSERT INTO stocks VALUES(1,'OTHER','TW')",
                        "INSERT INTO stock_signals VALUES(99,999,1)",
                        "INSERT INTO stock_signals VALUES(99,1,-1)"):
            try: sql('fixture_restored',invalid)
            except RuntimeError: pass
            else: raise RuntimeError('constraint_not_enforced')
        # Real corrupt-tag disk custody, with zero consumer calls and no new DB.
        with encrypted.open('r+b') as f:
            f.seek(-1, 2); b = f.read(1); f.seek(-1, 2); f.write(bytes([b[0] ^ 1]))
        calls = []
        with borrow_disk_snapshot(os.open(encrypted, os.O_RDONLY | os.O_CLOEXEC), dfd) as snapshot:
            try:
                authenticate_then_replay(snapshot, KEY, CONTEXT, calls.append)
            except FixtureAuthenticationRejected:
                if calls: raise RuntimeError('unauthenticated_consumer')
            else: raise RuntimeError('bad_tag_accepted')
        receipt.update(restoreVerified=True,fixtureRows={'stocks':2,'stock_signals':12},
                       dataSha256=expected,relationOrphans=0,constraints=constraints,
                       invalidRowsRejected=3,corruptTagRejectedBeforeConsumer=True)
    except DiskCustodyRejected as error:
        receipt.update(status='REFUSED',reason=str(error),kernelErrno=error.kernel_errno)
    except Exception as error:
        # Do not publish raw SQL, system logs or paths.
        receipt.update(status='FAILED',reason=type(error).__name__)
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        if pg:
            if pg.poll() is None: pg.terminate()
            try: pg.wait(timeout=10)
            except subprocess.TimeoutExpired: pg.kill();pg.wait(timeout=5)
        if pglog: pglog.close()
        os.close(dfd)
        shutil.rmtree(root)
        receipt['cleanup'] = {'privateTreeRemoved':not root.exists(),
                              'ownedPostmasterReaped':pg is None or pg.poll() is not None}
        receipt.setdefault('status','FIXTURE_PASS' if receipt['restoreVerified'] else 'FAILED')
        receipt['finishedUtc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    print(json.dumps(receipt,sort_keys=True,indent=2))
    return 0 if receipt['status']=='FIXTURE_PASS' else 2


if __name__ == '__main__':
    raise SystemExit(main())

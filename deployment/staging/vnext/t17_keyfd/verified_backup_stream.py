"""Held immutable FD + existing SI-BACKUP-1 two-pass streaming authentication.

No restore authority is minted here. The staging CLI separately observes OS
admission. Only <=64KiB sealed memfds are supported for synthetic kernel tests;
large sources MUST already be fs-verity inodes, never copied into RAM.
"""
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
import re
import select
import stat
import subprocess
import time
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.exceptions import InvalidTag
from .disk_custody import _measure, DiskCustodyRejected
from .sealed_fixture import F_GET_SEALS, REQUIRED_SEALS
from .portable_sql_fixture_adapter import _tools

MAGIC = b'SI-BACKUP-1\n'
HEADER = len(MAGIC) + 12 + 32
CHUNK = 256 * 1024
MAX_PLAIN = 8 * 1024**3


class BackupStreamRejected(Exception):
    pass


@contextmanager
def owned_staging_key(fd=3):
    """Root keystore OR current UID anonymous read pipe, exact32 + EOF.

    Root handoff is an explicit fixed-FD host capability contract, not a new
    backend. Other owners/files/stdio are rejected. Key bytes never enter argv,
    environment, artifacts or a new key file. Parent must be nondumpable first.
    """
    if type(fd) is not int or fd <= 2:
        raise BackupStreamRejected('key_selector_rejected')
    key = bytearray(33)
    try:
        try:
            info = os.fstat(fd)
            if (not stat.S_ISFIFO(info.st_mode) or info.st_uid not in (0,os.geteuid())
                    or not os.readlink('/proc/self/fd/'+str(fd)).startswith('pipe:[')
                    or fcntl.fcntl(fd,fcntl.F_GETFL) & os.O_ACCMODE != os.O_RDONLY):
                raise BackupStreamRejected('key_pipe_rejected')
            os.set_inheritable(fd,False)
            os.set_blocking(fd,False)
            deadline, used = time.monotonic()+5, 0
            while True:
                left=deadline-time.monotonic()
                if left<=0 or not select.select([fd],[],[],left)[0]:
                    raise BackupStreamRejected('key_pipe_deadline')
                try: count=os.readv(fd,[memoryview(key)[used:]])
                except (BlockingIOError,InterruptedError): continue
                if count==0:
                    if used!=32:raise BackupStreamRejected('key_pipe_length')
                    break
                used+=count
                if used>32:raise BackupStreamRejected('key_pipe_length')
        except OSError:
            raise BackupStreamRejected('key_pipe_io') from None
        finally:
            try:os.close(fd)
            except OSError:pass
        yield memoryview(key)[:32]
    finally:
        key[:]=b'\0'*len(key)


def _json_pairs(pairs):
    result={}
    for key,value in pairs:
        if key in result:raise BackupStreamRejected('manifest_duplicate_key')
        result[key]=value
    return result


def read_manifest(fd):
    if type(fd) is not int or fd<=2:
        raise BackupStreamRejected('manifest_selector_rejected')
    try:
        info=os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or not 0<info.st_size<=1024**2
                or fcntl.fcntl(fd,fcntl.F_GETFL)&os.O_ACCMODE!=os.O_RDONLY):
            raise BackupStreamRejected('manifest_fd_rejected')
        raw=os.pread(fd,1024**2+1,0)
        if len(raw)!=info.st_size:raise BackupStreamRejected('manifest_read_rejected')
        value=json.loads(raw,object_pairs_hook=_json_pairs,
                         parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
        manifest=value['manifest'];result=value['result'];context=value['contextSha256']
        schemas=('stockinsider-database-export-v1','stockinsider-database-export-v2',
                 'stockinsider-database-export-v3','stockinsider-database-compact-v1')
        if manifest['schema'] not in schemas or manifest['format']!='pg_dump_custom':
            raise BackupStreamRejected('manifest_schema_rejected')
        if not re.fullmatch('[0-9a-f]{64}',context):raise BackupStreamRejected('manifest_context_rejected')
        if manifest['schema']=='stockinsider-database-export-v3' and not (
            manifest.get('snapshot') is None and manifest.get('snapshotStrategy')=='pg_dump_internal_consistent_snapshot'
            and manifest.get('transport')=='contabo_ssh_local_unix_socket'
            and manifest.get('sourceEndpoint')=='local-unix-socket:stockinsider'
            and manifest.get('credentialsInCommandOrArtifact') is False
            and manifest.get('remoteEphemeralCredentialsUsed') is False
            and manifest.get('ownersAndGrantsIncluded') is True):
            raise BackupStreamRejected('manifest_v3_contract_rejected')
        if manifest['schema']=='stockinsider-database-export-v2' and not (
            manifest.get('snapshot') is None and manifest.get('snapshotStrategy')=='pg_dump_internal_consistent_snapshot'
            and manifest.get('transport')=='contabo_ipv6_direct_tls'
            and manifest.get('credentialsInCommandOrArtifact') is False
            and value.get('remoteEphemeralCredentialsRemoved') is True):
            raise BackupStreamRejected('manifest_v2_contract_rejected')
        if manifest['schema']=='stockinsider-database-compact-v1' and not (
            manifest.get('compactionPolicyVersion')=='legacy-runtime-v1'
            and isinstance(manifest.get('sourceBackupId'),str) and manifest['sourceBackupId']
            and re.fullmatch('[0-9a-f]{64}',manifest.get('sourceBackupPlaintextSha256',''))):
            raise BackupStreamRejected('manifest_compact_contract_rejected')
        if type(result['plaintextBytes']) is not int or not 0<result['plaintextBytes']<=MAX_PLAIN:
            raise BackupStreamRejected('manifest_archive_size_rejected')
        if not re.fullmatch('[0-9a-f]{64}',result['plaintextSha256']):
            raise BackupStreamRejected('manifest_digest_rejected')
        db_value=manifest['databaseBytes']
        if type(db_value) not in (int,str) or not re.fullmatch('[0-9]+',str(db_value)):
            raise BackupStreamRejected('manifest_database_size_rejected')
        database_bytes=int(db_value)
        if database_bytes<=0 or database_bytes>MAX_PLAIN:
            raise BackupStreamRejected('manifest_database_size_rejected')
        # Exact existing Node JSON.stringify semantics, not Python reserialization.
        _,node=_tools()
        code="import{createHash}from'node:crypto';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(createHash('sha256').update(JSON.stringify(JSON.parse(s).manifest)).digest('hex'));"
        p=subprocess.run([str(node),'--max-old-space-size=32','--input-type=module','-e',code],
                         input=raw,capture_output=True,timeout=10,
                         env={'PATH':'/usr/bin:/bin','LC_ALL':'C','HOME':'/nonexistent'})
        if p.returncode or p.stdout.decode()!=context:
            raise BackupStreamRejected('manifest_context_hash_rejected')
        return {'schema':manifest['schema'],'context':bytes.fromhex(context),
                'plaintextBytes':result['plaintextBytes'],'plaintextSha256':result['plaintextSha256'],
                'databaseBytes':database_bytes}
    except BackupStreamRejected:raise
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError):
        raise BackupStreamRejected('manifest_rejected') from None
    finally:
        try:os.close(fd)
        except OSError:pass


class VerifiedBackupStream:
    """Owns ciphertextFD; authenticates before an engine/TOC child can exist."""
    def __init__(self, fd, manifest, key):
        if type(fd) is not int or fd<=2:
            raise BackupStreamRejected('ciphertext_selector_rejected')
        self.fd=fd; self._key=bytearray()
        try:
            self.manifest=dict(manifest); self._key=bytearray(key)
            if len(self._key)!=32:raise BackupStreamRejected('backup_key_length_rejected')
            info=os.fstat(fd)
            if (not stat.S_ISREG(info.st_mode)
                    or fcntl.fcntl(fd,fcntl.F_GETFL)&os.O_ACCMODE!=os.O_RDONLY
                    or info.st_size!=manifest['plaintextBytes']+HEADER+16):
                raise BackupStreamRejected('ciphertext_fd_or_size_rejected')
            os.set_inheritable(fd,False)
            self.size=info.st_size
            try:
                self.identity=_measure(fd);self.kind='fsverity'
            except DiskCustodyRejected:
                try:seals=fcntl.fcntl(fd,F_GET_SEALS)
                except OSError:raise BackupStreamRejected('immutable_ciphertext_required') from None
                if self.size>65536 or seals&REQUIRED_SEALS!=REQUIRED_SEALS:
                    raise BackupStreamRejected('immutable_ciphertext_required')
                self.identity=seals;self.kind='small_kernel_sealed_memfd'
            self.header=self._read(0,HEADER)
            if self.header[:len(MAGIC)]!=MAGIC or self.header[-32:]!=manifest['context']:
                raise BackupStreamRejected('ciphertext_context_rejected')
            self.iv=self.header[len(MAGIC):len(MAGIC)+12];self.tag=self._read(self.size-16,16)
        except BaseException:
            self.close();raise

    def _read(self,start,size):
        result=os.pread(self.fd,size,start)
        if len(result)!=size:raise BackupStreamRejected('ciphertext_short_read')
        return result

    def _held(self):
        if self.fd is None:raise BackupStreamRejected('ciphertext_closed')
        if self.kind=='fsverity':identity=_measure(self.fd)
        else:identity=fcntl.fcntl(self.fd,F_GET_SEALS)
        if identity!=self.identity or os.fstat(self.fd).st_size!=self.size:
            raise BackupStreamRejected('ciphertext_identity_changed')

    def _pass(self,consumer=None):
        self._held()
        decipher=Cipher(algorithms.AES(self._key),modes.GCM(self.iv,self.tag)).decryptor()
        decipher.authenticate_additional_data(self.header)
        digest=hashlib.sha256();cipher_hash=hashlib.sha256(self.header);size=0
        try:
            for offset in range(HEADER,self.size-16,CHUNK):
                chunk=self._read(offset,min(CHUNK,self.size-16-offset));cipher_hash.update(chunk)
                plaintext=decipher.update(chunk);digest.update(plaintext);size+=len(plaintext)
                if consumer is not None:consumer(plaintext)
                del plaintext
            final=decipher.finalize();digest.update(final);size+=len(final)
            if consumer is not None and final:consumer(final)
        except InvalidTag:raise BackupStreamRejected('backup_authentication_failed') from None
        if size!=self.manifest['plaintextBytes'] or digest.hexdigest()!=self.manifest['plaintextSha256']:
            raise BackupStreamRejected('backup_plaintext_digest_failed')
        cipher_hash.update(self.tag)
        return cipher_hash.hexdigest()

    def authenticate(self):
        self.ciphertextSha256=self._pass()

    def replay(self,consumer):
        # No cached readiness Boolean/token can bypass authentication. Every
        # consumer is preceded by a fresh COMPLETE pass on this SAME sealed FD.
        self._pass()
        # Sealed inode + same captured key/header/tag guarantee identical bytes.
        self._pass(consumer)

    def close(self):
        if self.fd is not None:
            try:os.close(self.fd)
            except OSError:pass
            self.fd=None
        self._key[:]=b'\0'*len(self._key)

    def __enter__(self):return self
    def __exit__(self,*_):self.close()

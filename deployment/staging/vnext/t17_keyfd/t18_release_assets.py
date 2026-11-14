"""Fixed root-owned RO T18 assets, verified without whole-release buffering.

Runtime has no source/pin/path/readiness override. Host must retain the RO asset
mount and prevent privileged mutation until every owned child exits. This binds
existing binaries; it does not authorize DB/reader/rollback execution itself.
"""
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from types import MappingProxyType
from .staging_admission import _mounts

ASSET_ROOT = '/run/t18-assets'
RELEASE_PINS = (
 ('169aad1b6cfa747f78ae3464b614f43c0749d806','2893ad708f4164abdc269e40bfcf15d167e00ee7e4e6b539e82305e25830575a'),
 ('dd59817f750684b093965f539dd4de466be13077','344489589e929158a73d658c968128a563dd53ed9a5eac6b37ee89553b9a0a4a'),
)
POSTGREST_SHA256 = '0cf367dc2ee47d5c648baa2952e25bdf299de4e1998d31e251bb00d129262d71'
NODE_PATH='/usr/bin/node'
NODE_VERSION='v22.23.1'
NODE_SHA256='93956de2e59480474a7b46571da1651180b1a050cdf32641ebec4ce6e478e068'
MAX_MANIFEST = 16 * 1024**2
MAX_FILE_BYTES = 1024**3
MAX_FILES = 100000
MAX_TREE = 200000
MAX_PATH = 4096
CHUNK = 1024**2
HEX40 = re.compile(r'^[0-9a-f]{40}$')
HEX64 = re.compile(r'^[0-9a-f]{64}$')
FORBIDDEN = re.compile(r'^(?:backup|backups|secrets?|vault|key|keys|id_rsa|id_ed25519|\.pgpass|\.env(?:\..*)?)$',re.I)


class ReleaseAssetsRejected(Exception):
    """Sanitized refusal only; never dump package content or system paths."""


def _json(data):
    def pairs(values):
        result={}
        for key,value in values:
            if key in result:raise ReleaseAssetsRejected('duplicate_json_member')
            result[key]=value
        return result
    try:return json.loads(data.decode('utf-8'),object_pairs_hook=pairs,
                          parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
    except (ValueError,UnicodeError,RecursionError):raise ReleaseAssetsRejected('asset_json_rejected') from None


def _exact(value,keys):
    return type(value) is dict and set(value)==set(keys.split())


def _integer(value,maximum=2**53-1):
    return type(value) is int and 0<=value<=maximum


def _relative(value):
    if (type(value) is not str or not value or len(value)>MAX_PATH or value.startswith('/')
            or re.match(r'^[a-zA-Z]:',value) or '\\' in value
            or any(ord(c)<32 or ord(c)==127 for c in value)):
        raise ReleaseAssetsRejected('asset_path_rejected')
    pieces=value.split('/')
    if len(pieces)>64 or any(not p or p in ('.','..') or FORBIDDEN.fullmatch(p)
            or p.lower().endswith(('.key','.p12','.pfx','.sib','.dump')) for p in pieces):
        raise ReleaseAssetsRejected('asset_path_rejected')
    return pieces


def _open_relative(rootfd,relative,directory=False):
    pieces=_relative(relative)
    current=os.dup(rootfd)
    try:
        for index,piece in enumerate(pieces):
            last=index==len(pieces)-1
            flags=os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW|os.O_NONBLOCK
            if not last or directory:flags|=os.O_DIRECTORY
            target=os.open(piece,flags,dir_fd=current)
            os.close(current);current=target
        return current
    except BaseException:
        os.close(current)
        raise


def _manifest_mode_allowed(mode,commit,pin):
    # Parsing permission only. The canonical manifest digest is checked first;
    # no file or executable is admitted by this structural predicate.
    return not mode&0o022 or (mode==0o664 and (commit,pin) in RELEASE_PINS)


def _root_0664_metadata(info):
    return (stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode)==0o664
            and info.st_uid==0 and info.st_gid==0 and info.st_nlink==1)


def _fd_mount_id(fd):
    matches=re.findall(r'^mnt_id:\s*(\d+)$',Path('/proc/self/fdinfo/'+str(fd)).read_text(),re.M)
    if len(matches)!=1:raise ReleaseAssetsRejected('release_mount_identity_required')
    return int(matches[0])


class _PinnedReadonlyRelease:
    """Private live kernel-observed lease, never caller readiness/metadata."""
    def __init__(self,held,identity,commit,pin):
        self.held,self.identity,self.commit,self.pin=held,identity,commit,pin
        self.members=None
        self.mount_id=_fd_mount_id(held)

    def require_root(self,rootfd):
        if self.held is None or (self.commit,self.pin) not in RELEASE_PINS:
            raise ReleaseAssetsRejected('pinned_readonly_release_required')
        for fd in (self.held,rootfd):
            info=os.fstat(fd)
            if ((info.st_dev,info.st_ino)!=self.identity or not stat.S_ISDIR(info.st_mode)
                or info.st_uid!=0 or info.st_mode&0o7022 or _fd_mount_id(fd)!=self.mount_id
                or not os.fstatvfs(fd).f_flag&os.ST_RDONLY):
                raise ReleaseAssetsRejected('pinned_readonly_release_required')

    def require_member(self,rootfd,relative,info,filefd=None):
        self.require_root(rootfd)
        if (self.members is None or self.members.get(relative)!=0o664
            or not _root_0664_metadata(info)
            or filefd is not None and not os.fstatvfs(filefd).f_flag&os.ST_RDONLY):
            raise ReleaseAssetsRejected('pinned_root_group_0664_member_required')

    def close(self):
        if self.held is not None:os.close(self.held);self.held=None
        self.members=None


def _observe_pinned_release(rootfd,commit,pin):
    # Public runtime accepts no path/pin override. This internal factory is
    # called only for the two compiled release pairs and observes the fixed RO
    # root before binding an independently opened fixed release to this FD.
    if (commit,pin) not in RELEASE_PINS:
        raise ReleaseAssetsRejected('fixed_release_pair_required')
    _observe_root()
    fixed=None;held=None
    try:
        fixed=os.open(ASSET_ROOT,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC|os.O_NOFOLLOW)
        held=_open_relative(fixed,commit,True)
        info=os.fstat(held)
        lease=_PinnedReadonlyRelease(held,(info.st_dev,info.st_ino),commit,pin)
        lease.require_root(rootfd)
        held=None
        return lease
    finally:
        if held is not None:os.close(held)
        if fixed is not None:os.close(fixed)


def _inspect_file(rootfd,relative,limit,expected=None,capture=False,readonly_release=None):
    fd=None
    try:
        fd=_open_relative(rootfd,relative)
        before=os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_nlink!=1 or before.st_size>limit
                or before.st_mode&0o7000
                or expected and (before.st_size!=expected['bytes'] or stat.S_IMODE(before.st_mode)!=expected['mode'])):
            raise ReleaseAssetsRejected('asset_file_metadata_rejected')
        if before.st_mode&0o022:
            if type(readonly_release) is not _PinnedReadonlyRelease:
                raise ReleaseAssetsRejected('asset_file_metadata_rejected')
            readonly_release.require_member(rootfd,relative,before,fd)
        digest=hashlib.sha256();captured=bytearray();total=0
        while chunk:=os.read(fd,CHUNK):
            total+=len(chunk)
            if total>limit:raise ReleaseAssetsRejected('asset_file_size_rejected')
            digest.update(chunk)
            if capture:captured.extend(chunk)
        after=os.fstat(fd)
        names=('st_dev','st_ino','st_size','st_mode','st_uid','st_gid','st_nlink','st_mtime_ns','st_ctime_ns')
        if total!=before.st_size or any(getattr(before,n)!=getattr(after,n) for n in names):
            raise ReleaseAssetsRejected('asset_file_changed')
        return digest.hexdigest(),bytes(captured) if capture else None
    except OSError:raise ReleaseAssetsRejected('asset_file_open_rejected') from None
    finally:
        if fd is not None:os.close(fd)


def _validate_manifest(receipt,commit,pin):
    if not _exact(receipt,'manifest manifestSha256') or receipt['manifestSha256']!=pin:
        raise ReleaseAssetsRejected('asset_manifest_pin_rejected')
    manifest=receipt['manifest']
    if (not _exact(manifest,'schema releaseId sourceCommit packagerCommit createdAt entrypoint fileCount bytes files')
            or manifest['schema']!='stockinsider-standalone-release-v2'
            or manifest['sourceCommit']!=commit or manifest['releaseId']!=commit
            or type(manifest['packagerCommit']) is not str or not HEX40.fullmatch(manifest['packagerCommit'])
            or type(manifest['createdAt']) is not str or type(manifest['files']) is not list
            or not 1<=len(manifest['files'])<=MAX_FILES
            or not _integer(manifest['fileCount'],MAX_FILES) or manifest['fileCount']!=len(manifest['files'])
            or not _integer(manifest['bytes'],MAX_FILE_BYTES)):
        raise ReleaseAssetsRejected('asset_manifest_rejected')
    # Exact schema has no integer object keys/floats; compact UTF8 serialization
    # therefore matches JS JSON.stringify used by the original V2 verifier.
    try:canonical=json.dumps(manifest,separators=(',',':'),ensure_ascii=False).encode('utf-8')
    except (ValueError,UnicodeError):raise ReleaseAssetsRejected('asset_manifest_rejected') from None
    if hashlib.sha256(canonical).hexdigest()!=pin:
        raise ReleaseAssetsRejected('asset_manifest_pin_rejected')
    paths=set();total=0
    for item in manifest['files']:
        if (not _exact(item,'path bytes mode sha256') or not _integer(item['bytes'],MAX_FILE_BYTES)
                or not _integer(item['mode'],0o777) or not _manifest_mode_allowed(item['mode'],commit,pin)
                or type(item['sha256']) is not str or not HEX64.fullmatch(item['sha256'])):
            raise ReleaseAssetsRejected('asset_member_rejected')
        _relative(item['path'])
        if item['path']=='release-manifest.json' or item['path'] in paths:
            raise ReleaseAssetsRejected('asset_member_rejected')
        paths.add(item['path']);total+=item['bytes']
    _relative(manifest['entrypoint'])
    if (manifest['entrypoint']!='app/server.js' or manifest['entrypoint'] not in paths
            or total!=manifest['bytes']):
        raise ReleaseAssetsRejected('asset_entry_or_aggregate_rejected')
    return manifest,paths


def _tree(rootfd,root_owner=False,readonly_release=None):
    actual=set();pending=[''];members=0
    while pending:
        relative=pending.pop();fd=os.dup(rootfd) if not relative else _open_relative(rootfd,relative,True)
        try:
            directory=os.fstat(fd)
            if directory.st_mode&0o7022 or root_owner and directory.st_uid!=0:
                raise ReleaseAssetsRejected('asset_directory_metadata_rejected')
            with os.scandir(fd) as entries:
                for entry in entries:
                    path=entry.name if not relative else relative+'/'+entry.name
                    _relative(path);members+=1
                    if members>MAX_TREE:raise ReleaseAssetsRejected('asset_tree_limit')
                    info=entry.stat(follow_symlinks=False)
                    if (info.st_mode&0o7000 or root_owner and info.st_uid!=0):
                        raise ReleaseAssetsRejected('asset_tree_metadata_rejected')
                    if info.st_mode&0o022:
                        if type(readonly_release) is not _PinnedReadonlyRelease:
                            raise ReleaseAssetsRejected('asset_tree_metadata_rejected')
                        readonly_release.require_member(rootfd,path,info)
                    if stat.S_ISDIR(info.st_mode):pending.append(path)
                    elif stat.S_ISREG(info.st_mode) and info.st_nlink==1:
                        if path!='release-manifest.json':actual.add(path)
                        if len(actual)>MAX_FILES:raise ReleaseAssetsRejected('asset_file_count_limit')
                    else:raise ReleaseAssetsRejected('asset_link_or_special_rejected')
        finally:os.close(fd)
    return actual


def _verify_release_contents(rootfd,commit,pin):
    # Unknown synthetic pins retain the original strict non-writable content
    # helper. The 0664 exception requires actual fixed-root admission even here.
    lease=_observe_pinned_release(rootfd,commit,pin) if (commit,pin) in RELEASE_PINS else None
    try:
        _,data=_inspect_file(rootfd,'release-manifest.json',MAX_MANIFEST,capture=True)
        manifest,paths=_validate_manifest(_json(data),commit,pin)
        if lease is not None:
            lease.members=MappingProxyType({item['path']:item['mode'] for item in manifest['files']})
        if _tree(rootfd,root_owner=lease is not None,readonly_release=lease)!=paths:
            raise ReleaseAssetsRejected('asset_member_set_rejected')
        for item in manifest['files']:
            digest,_=_inspect_file(rootfd,item['path'],item['bytes'],item,readonly_release=lease)
            if digest!=item['sha256']:raise ReleaseAssetsRejected('asset_member_digest_rejected')
        _,package=_inspect_file(rootfd,'app/node_modules/next/package.json',1024**2,capture=True,readonly_release=lease)
        package_json=_json(package)
        if type(package_json) is not dict or package_json.get('version')!='16.3.4':
            raise ReleaseAssetsRejected('fixed_next_version_required')
        _,build=_inspect_file(rootfd,'app/.next/BUILD_ID',4096,capture=True,readonly_release=lease)
        try:build_id=build.decode('ascii').strip()
        except UnicodeError:raise ReleaseAssetsRejected('asset_build_id_rejected') from None
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,256}',build_id):raise ReleaseAssetsRejected('asset_build_id_rejected')
        return {'sourceCommit':commit,'manifestSha256':pin,'bytes':manifest['bytes'],
                'fileCount':manifest['fileCount'],'buildId':build_id,'nextVersion':'16.3.4','entrypoint':'app/server.js'}
    finally:
        if lease is not None:lease.close()


def _observe_root():
    if os.geteuid()==0:raise ReleaseAssetsRejected('nonroot_assets_consumer_required')
    status=Path('/proc/self/status').read_text()
    for field in ('CapEff','CapPrm','CapAmb'):
        match=re.search(r'^'+field+r':\s*([0-9a-fA-F]+)$',status,re.M)
        if match is None or int(match.group(1),16):raise ReleaseAssetsRejected('capability_free_assets_required')
    # Fixed ancestors are trusted root-owned, unmodifiable by the stage UID.
    for path in ('/run',ASSET_ROOT):
        info=os.lstat(path)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o7022:
            raise ReleaseAssetsRejected('root_owned_asset_ancestors_required')
    mounts=_mounts(Path('/proc/self/mountinfo').read_text())
    exact=[m for m in mounts if m['mount']==ASSET_ROOT]
    if len(exact)!=1:raise ReleaseAssetsRejected('fixed_readonly_asset_mount_required')
    for mount in mounts:
        if mount['mount']==ASSET_ROOT or mount['mount'].startswith(ASSET_ROOT+'/'):
            if 'ro' not in mount['options'] or any(p.startswith('shared:') for p in mount['optional']):
                raise ReleaseAssetsRejected('fixed_readonly_asset_mount_required')


def _verify_held_binary(fd,expected_digest):
    """Private bounded content check; runtime performs root/RO binding too."""
    before=os.fstat(fd)
    if (not stat.S_ISREG(before.st_mode) or before.st_nlink!=1
            or before.st_size>MAX_FILE_BYTES or before.st_mode&0o7022):
        raise ReleaseAssetsRejected('fixed_binary_metadata_rejected')
    digest=hashlib.sha256();offset=0
    while chunk:=os.pread(fd,CHUNK,offset):
        offset+=len(chunk)
        if offset>MAX_FILE_BYTES:raise ReleaseAssetsRejected('fixed_binary_size_rejected')
        digest.update(chunk)
    after=os.fstat(fd)
    fields=('st_dev','st_ino','st_size','st_mode','st_nlink','st_mtime_ns','st_ctime_ns')
    if offset!=before.st_size or any(getattr(before,k)!=getattr(after,k) for k in fields):
        raise ReleaseAssetsRejected('fixed_binary_changed')
    if digest.hexdigest()!=expected_digest:
        raise ReleaseAssetsRejected('fixed_binary_digest_required')


def _observe_fixed_node():
    """No path/version/pin override; hold the exact root-owned readonly inode."""
    fd=None
    try:
        for path in ('/usr','/usr/bin'):
            info=os.lstat(path)
            if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o7022:
                raise ReleaseAssetsRejected('fixed_node_ancestor_rejected')
        rows=_mounts(Path('/proc/self/mountinfo').read_text())
        covering=[row for row in rows if NODE_PATH==row['mount']
                  or NODE_PATH.startswith(row['mount'].rstrip('/')+'/')]
        if not covering:raise ReleaseAssetsRejected('fixed_node_readonly_mount_required')
        nearest=max(covering,key=lambda row:len(row['mount']))
        if 'ro' not in nearest['options'] or any(p.startswith('shared:') for p in nearest['optional']):
            raise ReleaseAssetsRejected('fixed_node_readonly_mount_required')
        fd=os.open(NODE_PATH,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW|os.O_NONBLOCK)
        info=os.fstat(fd)
        if info.st_uid!=0 or not info.st_mode&0o111:
            raise ReleaseAssetsRejected('fixed_node_metadata_rejected')
        _verify_held_binary(fd,NODE_SHA256)
        return fd
    except BaseException:
        if fd is not None:os.close(fd)
        raise


@dataclass(frozen=True)
class BorrowedReleaseAssets:
    releases: tuple
    postgrest_path: str
    postgrest_fd: int
    root_fd: int
    release_fds: tuple
    node_path: str
    node_fd: int


@contextmanager
def observe_fixed_release_assets():
    """Borrow only fixed root-owned RO assets; hold until all children stop."""
    held=[]
    try:
        _observe_root()
        rootfd=os.open(ASSET_ROOT,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC|os.O_NOFOLLOW)
        held.append(rootfd);releases=[];release_fds=[]
        for commit,pin in RELEASE_PINS:
            fd=_open_relative(rootfd,commit,True);held.append(fd);release_fds.append(fd)
            identity=_verify_release_contents(fd,commit,pin)
            identity['directory']=ASSET_ROOT+'/'+commit
            identity['serverPath']=identity['directory']+'/app/server.js'
            releases.append(identity)
        if releases[0]['buildId']==releases[1]['buildId']:
            raise ReleaseAssetsRejected('distinct_build_ids_required')
        binaryfd=_open_relative(rootfd,'postgrest');held.append(binaryfd)
        info=os.fstat(binaryfd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_nlink!=1
                or info.st_mode&0o7022 or not info.st_mode&0o111):
            raise ReleaseAssetsRejected('postgrest_metadata_rejected')
        _verify_held_binary(binaryfd,POSTGREST_SHA256)
        nodefd=_observe_fixed_node();held.append(nodefd)
        yield BorrowedReleaseAssets(tuple(MappingProxyType(item) for item in releases),
                                   ASSET_ROOT+'/postgrest',binaryfd,rootfd,tuple(release_fds),NODE_PATH,nodefd)
    except ReleaseAssetsRejected:raise
    except (OSError,ValueError,TypeError):raise ReleaseAssetsRejected('fixed_release_assets_unavailable') from None
    finally:
        for fd in reversed(held):os.close(fd)
